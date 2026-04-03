// ============================================
// Hospital Doctors Appointment Scheduler
// Multi-Tenant SaaS Version - Single Database
// ============================================

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// DATABASE - Single PostgreSQL Database
// ============================================

const SUPER_DB = process.env.SUPER_DB || 'postgresql://neondb_owner:npg_E7Aqg2ofyjHD@ep-winter-salad-a125zfed-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require';

let superPool = null;

function getPool() {
    if (!superPool) {
        superPool = new Pool({ 
            connectionString: SUPER_DB,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            ssl: { rejectUnauthorized: false }
        });
    }
    return superPool;
}

function initDatabase() {
    const pool = getPool();
    
    // Create hospitals table
    pool.query(`
        CREATE TABLE IF NOT EXISTS hospitals (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            slug VARCHAR(100) UNIQUE NOT NULL,
            admin_username VARCHAR(100) NOT NULL,
            admin_password VARCHAR(255) NOT NULL,
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )
    `).then(() => {
        console.log('Hospitals table ready');
        
        // Create doctors table with hospital_slug
        pool.query(`
            CREATE TABLE IF NOT EXISTS doctors (
                id VARCHAR(50) PRIMARY KEY,
                name_en VARCHAR(255) NOT NULL,
                name_ur VARCHAR(255),
                specialization_en VARCHAR(255),
                specialization_ur VARCHAR(255),
                phone VARCHAR(50),
                email VARCHAR(255),
                password VARCHAR(255) DEFAULT '12345678',
                working_hours JSONB,
                hospital_slug VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `).then(() => console.log('Doctors table ready')).catch(() => {});
        
        // Create appointments table with hospital_slug
        pool.query(`
            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                doctor_id VARCHAR(50),
                doctor_name VARCHAR(255),
                patient_name VARCHAR(255) NOT NULL,
                patient_phone VARCHAR(50) NOT NULL,
                date VARCHAR(20) NOT NULL,
                time VARCHAR(20) NOT NULL,
                reason TEXT,
                status VARCHAR(20) DEFAULT 'scheduled',
                hospital_slug VARCHAR(100) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `).then(() => console.log('Appointments table ready')).catch(() => {});
        
        // Create settings table with hospital_slug
        pool.query(`
            CREATE TABLE IF NOT EXISTS settings (
                id SERIAL PRIMARY KEY,
                key VARCHAR(100) NOT NULL,
                value TEXT,
                hospital_slug VARCHAR(100) NOT NULL,
                UNIQUE(key, hospital_slug)
            )
        `).then(() => console.log('Settings table ready')).catch(() => {});
        
        // Add sample hospitals if none exist
        pool.query('SELECT COUNT(*) as count FROM hospitals').then(result => {
            if (parseInt(result.rows[0].count) === 0) {
                pool.query(`
                    INSERT INTO hospitals (name, slug, admin_username, admin_password, active, created_at)
                    VALUES 
                    ('City General Hospital', 'city-hospital', 'admin', 'city123', true, NOW()),
                    ('Medicare Center', 'medicare', 'admin', 'med123', true, NOW()),
                    ('Health Plus Hospital', 'health-plus', 'admin', 'health123', true, NOW())
                `).then(() => {
                    console.log('Sample hospitals created');
                    
                    // Add default settings for each hospital
                    const hospitalSettings = [
                        ['city-hospital', 'City General Hospital'],
                        ['medicare', 'Medicare Center'],
                        ['health-plus', 'Health Plus Hospital']
                    ];
                    
                    hospitalSettings.forEach(([slug, name]) => {
                        pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['hospital_name', name, slug]);
                        pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['hospital_phone', '+92-300-1234567', slug]);
                        pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['hospital_email', 'info@hospital.com', slug]);
                    });
                    console.log('Sample settings added');
                }).catch(() => {});
            }
        }).catch(() => {});
    }).catch(err => {
        console.log('Database init error:', err.message);
    });
}

async function getHospitalBySlug(slug) {
    const pool = getPool();
    const result = await pool.query(
        'SELECT * FROM hospitals WHERE slug = $1 AND active = true',
        [slug]
    );
    return result.rows[0];
}

async function getAllHospitals() {
    const pool = getPool();
    const result = await pool.query('SELECT id, name, slug, created_at FROM hospitals ORDER BY created_at DESC');
    return result.rows;
}

async function createHospital(name, slug, adminUsername, adminPassword) {
    const pool = getPool();
    const result = await pool.query(
        `INSERT INTO hospitals (name, slug, admin_username, admin_password, active, created_at)
         VALUES ($1, $2, $3, $4, true, NOW())
         RETURNING id, name, slug`,
        [name, slug, adminUsername, adminPassword]
    );
    
    const hospital = result.rows[0];
    
    // Add default settings for new hospital
    await pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['hospital_name', name, slug]);
    await pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['hospital_phone', '+92-300-1234567', slug]);
    await pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', ['hospital_email', 'info@hospital.com', slug]);
    
    return hospital;
}

async function authenticateHospitalAdmin(username, password, hospitalSlug) {
    const hospital = await getHospitalBySlug(hospitalSlug);
    if (!hospital) return null;
    if (hospital.admin_username === username && hospital.admin_password === password) {
        return hospital;
    }
    return null;
}

// ============================================
// CONFIGURATION
// ============================================

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================
// MIDDLEWARE
// ============================================

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
    secret: 'doctor-scheduler-secret-key',
    resave: false,
    saveUninitialized: false
}));

// ============================================
// HELPER FUNCTIONS
// ============================================

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return dateStr;
}

// ============================================
// PUBLIC ROUTES
// ============================================

const SUPER_ADMIN_USERNAME = 'superadmin';
const SUPER_ADMIN_PASSWORD = 'HDS@2024!';

app.get('/super-admin/login', (req, res) => {
    res.render('super-admin/login', { error: null });
});

app.post('/super-admin/login', (req, res) => {
    const { username, password } = req.body;
    if (username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD) {
        req.session.superAdmin = true;
        res.redirect('/super-admin/dashboard');
    } else {
        res.render('super-admin/login', { error: 'Invalid credentials' });
    }
});

app.get('/super-admin/dashboard', async (req, res) => {
    if (!req.session.superAdmin) {
        return res.redirect('/super-admin/login');
    }
    try {
        const hospitals = await getAllHospitals();
        res.render('super-admin/dashboard', { hospitals, user: req.session.superAdmin, error: null });
    } catch (err) {
        console.error('Error fetching hospitals:', err);
        res.render('super-admin/dashboard', { hospitals: [], user: req.session.superAdmin, error: err.message });
    }
});

app.post('/super-admin/hospitals/add', async (req, res) => {
    if (!req.session.superAdmin) {
        return res.redirect('/super-admin/login');
    }
    const { name, slug, adminUsername, adminPassword } = req.body;
    try {
        await createHospital(name, slug, adminUsername, adminPassword);
        res.redirect('/super-admin/dashboard');
    } catch (err) {
        console.error('Error creating hospital:', err);
        const hospitals = await getAllHospitals();
        res.render('super-admin/dashboard', { hospitals, user: req.session.superAdmin, error: err.message });
    }
});

app.get('/super-admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/super-admin/login');
});

app.get('/', (req, res) => res.redirect('/login'));
app.get('/login', (req, res) => res.render('login', { error: null, lang: 'en' }));
app.get('/admin', (req, res) => res.render('admin-login', { error: null }));
app.get('/doctor-login', (req, res) => res.redirect('/login'));
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// ============================================
// HOSPITAL ROUTES (Multi-Tenant - Single Database)
// ============================================

app.get('/:hospital/login', async (req, res) => {
    const { hospital } = req.params;
    const hospitalData = await getHospitalBySlug(hospital);
    if (!hospitalData) return res.status(404).send('Hospital not found');
    res.render('hospital/login', { error: null, hospital: hospitalData, hospitalSlug: hospital });
});

app.post('/:hospital/login', async (req, res) => {
    const { hospital } = req.params;
    const { username, password } = req.body;
    const hospitalData = await authenticateHospitalAdmin(username, password, hospital);
    if (hospitalData) {
        req.session.user = { username, name: 'Administrator', role: 'admin', hospital: hospitalData.slug };
        res.redirect(`/${hospital}/admin/dashboard`);
    } else {
        const hospitalInfo = await getHospitalBySlug(hospital);
        res.render('hospital/login', { error: 'Invalid credentials', hospital: hospitalInfo, hospitalSlug: hospital });
    }
});

app.get('/:hospital/admin/dashboard', async (req, res) => {
    if (!req.session.user || !req.session.user.hospital) {
        return res.redirect(`/${req.params.hospital}/login`);
    }
    const { hospital } = req.params;
    if (req.session.user.hospital !== hospital) {
        return res.redirect(`/${hospital}/login`);
    }
    
    try {
        const pool = getPool();
        const appointmentsResult = await pool.query('SELECT * FROM appointments WHERE hospital_slug = $1 ORDER BY date DESC, time DESC', [hospital]);
        const doctorsResult = await pool.query('SELECT * FROM doctors WHERE hospital_slug = $1 ORDER BY name_en', [hospital]);
        const settingsResult = await pool.query('SELECT * FROM settings WHERE hospital_slug = $1', [hospital]);
        
        const today = new Date().toISOString().split('T')[0];
        const todayAppts = appointmentsResult.rows.filter(a => a.date === today);
        const upcomingAppts = appointmentsResult.rows.filter(a => a.date > today && a.status !== 'cancelled');
        
        const settings = {};
        settingsResult.rows.forEach(s => { settings[s.key] = s.value; });
        
        res.render('hospital/dashboard', {
            user: req.session.user,
            hospital,
            todayAppointments: todayAppts,
            upcomingAppointments: upcomingAppts,
            totalAppointments: appointmentsResult.rows.length,
            doctors: doctorsResult.rows,
            settings,
            lang: 'en'
        });
    } catch (err) {
        console.error('Error loading dashboard:', err.message);
        res.status(500).send('Error loading dashboard');
    }
});

app.get('/:hospital/admin/appointments', async (req, res) => {
    if (!req.session.user || !req.session.user.hospital) {
        return res.redirect(`/${req.params.hospital}/login`);
    }
    const { hospital } = req.params;
    const pool = getPool();
    const doctorsResult = await pool.query('SELECT * FROM doctors WHERE hospital_slug = $1 ORDER BY name_en', [hospital]);
    const appointmentsResult = await pool.query('SELECT * FROM appointments WHERE hospital_slug = $1 ORDER BY date DESC, time DESC', [hospital]);
    res.render('hospital/appointments', { user: req.session.user, hospital, appointments: appointmentsResult.rows, doctors: doctorsResult.rows, filters: req.query, lang: 'en' });
});

app.get('/:hospital/admin/doctors', async (req, res) => {
    if (!req.session.user || !req.session.user.hospital || req.session.user.role !== 'admin') {
        return res.redirect(`/${req.params.hospital}/login`);
    }
    const { hospital } = req.params;
    const pool = getPool();
    const doctorsResult = await pool.query('SELECT * FROM doctors WHERE hospital_slug = $1 ORDER BY name_en', [hospital]);
    res.render('hospital/doctors', { user: req.session.user, hospital, doctors: doctorsResult.rows, lang: 'en' });
});

app.get('/:hospital/admin/book', async (req, res) => {
    if (!req.session.user || !req.session.user.hospital) {
        return res.redirect(`/${req.params.hospital}/login`);
    }
    const { hospital } = req.params;
    const pool = getPool();
    const doctorsResult = await pool.query('SELECT * FROM doctors WHERE hospital_slug = $1 ORDER BY name_en', [hospital]);
    res.render('hospital/book', { user: req.session.user, hospital, doctors: doctorsResult.rows, lang: 'en' });
});

app.post('/:hospital/admin/appointments/book', async (req, res) => {
    if (!req.session.user || !req.session.user.hospital) {
        return res.redirect(`/${req.params.hospital}/login`);
    }
    const { hospital } = req.params;
    const { doctorId, patientName, patientPhone, date, time, reason } = req.body;
    const pool = getPool();
    
    const doctorResult = await pool.query('SELECT name_en, specialization_en FROM doctors WHERE id = $1 AND hospital_slug = $2', [doctorId, hospital]);
    const doctor = doctorResult.rows[0];
    
    await pool.query(
        `INSERT INTO appointments (doctor_id, doctor_name, patient_name, patient_phone, date, time, reason, status, hospital_slug)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'scheduled', $8)`,
        [doctorId, `${doctor.name_en} (${doctor.specialization_en})`, patientName, patientPhone, date, time, reason, hospital]
    );
    
    res.redirect(`/${hospital}/admin/appointments`);
});

app.get('/:hospital/admin/settings', async (req, res) => {
    if (!req.session.user || !req.session.user.hospital || req.session.user.role !== 'admin') {
        return res.redirect(`/${req.params.hospital}/login`);
    }
    const { hospital } = req.params;
    const pool = getPool();
    const settingsResult = await pool.query('SELECT * FROM settings WHERE hospital_slug = $1', [hospital]);
    const settings = {};
    settingsResult.rows.forEach(s => { settings[s.key] = s.value; });
    res.render('hospital/settings', { user: req.session.user, hospital, settings, lang: 'en' });
});

app.post('/:hospital/admin/settings', async (req, res) => {
    if (!req.session.user || !req.session.user.hospital || req.session.user.role !== 'admin') {
        return res.redirect(`/${req.params.hospital}/login`);
    }
    const { hospital } = req.params;
    const { hospital_name, hospital_phone, hospital_email } = req.body;
    const pool = getPool();
    
    await pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT(key, hospital_slug) DO UPDATE SET value = $2', ['hospital_name', hospital_name, hospital]);
    await pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT(key, hospital_slug) DO UPDATE SET value = $2', ['hospital_phone', hospital_phone, hospital]);
    await pool.query('INSERT INTO settings (key, value, hospital_slug) VALUES ($1, $2, $3) ON CONFLICT(key, hospital_slug) DO UPDATE SET value = $2', ['hospital_email', hospital_email, hospital]);
    
    res.redirect(`/${hospital}/admin/settings`);
});

app.get('/:hospital/logout', (req, res) => {
    const hospital = req.params.hospital;
    req.session.destroy();
    res.redirect(`/${hospital}/login`);
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('Hospital Doctors Appointment Scheduler');
    console.log('Multi-Tenant SaaS - Single Database');
    console.log('========================================');
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Super Admin: http://localhost:${PORT}/super-admin/login`);
    console.log('========================================');
    
    initDatabase();
});