// ============================================
// Hospital Doctors Appointment Scheduler
// ============================================

const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

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

function getDoctors() {
    try {
        const data = fs.readFileSync(path.join(DATA_DIR, 'doctors.json'), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { doctors: [] };
    }
}

function saveDoctors(data) {
    fs.writeFileSync(path.join(DATA_DIR, 'doctors.json'), JSON.stringify(data, null, 2));
}

function getAppointments() {
    try {
        const data = fs.readFileSync(path.join(DATA_DIR, 'appointments.json'), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return { appointments: [] };
    }
}

function saveAppointments(data) {
    fs.writeFileSync(path.join(DATA_DIR, 'appointments.json'), JSON.stringify(data, null, 2));
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return dateStr;
}

function getSettings() {
    try {
        const data = fs.readFileSync(path.join(DATA_DIR, 'settings.json'), 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return {
            hospital: {
                name_en: 'City General Hospital',
                name_ur: 'سٹی جنرل ہسپتال',
                address_en: '123 Medical Road, City',
                address_ur: '123 میڈیکل روڈ، شہر',
                phone: '+92-42-1234567'
            },
            admin: {
                username: 'admin',
                password: '$2a$10$xQZ8K9HxF5YyRjK8YvN3zO.pQ8Z1Y2Z1Y2Z1Y2Z1Y2Z1Y2Z1Y2Z' // 12345678
            },
            email: {
                enabled: false,
                host: 'smtp.hostinger.com',
                port: 465,
                secure: true,
                user: '',
                password: '',
                to: ''
            }
        };
    }
}

function saveSettings(data) {
    fs.writeFileSync(path.join(DATA_DIR, 'settings.json'), JSON.stringify(data, null, 2));
}

function generateDoctorId() {
    const data = getDoctors();
    const maxId = data.doctors.reduce((max, doc) => {
        const num = parseInt(doc.id.replace('DR', ''));
        return num > max ? num : max;
    }, 0);
    return 'DR' + String(maxId + 1).padStart(3, '0');
}

function generateAppointmentId() {
    const data = getAppointments();
    return 'APT' + Date.now();
}

function getAvailableSlots(doctorId, date) {
    const doctors = getDoctors();
    const doctor = doctors.doctors.find(d => d.id === doctorId);
    
    if (!doctor || !doctor.workingHours) {
        return [];
    }

    const { start, end, slotDuration, days } = doctor.workingHours;
    const dayOfWeek = new Date(date).toLocaleDateString('en-US', { weekday: 'short' });
    
    if (!days.includes(dayOfWeek)) {
        return [];
    }

    const slots = [];
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);
    
    let currentTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;
    const duration = parseInt(slotDuration);

    while (currentTime + duration <= endTime) {
        const hours = Math.floor(currentTime / 60);
        const minutes = currentTime % 60;
        const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
        
        // Check if slot is booked
        const appointments = getAppointments();
        const isBooked = appointments.appointments.some(apt => 
            apt.doctorId === doctorId && 
            apt.date === date && 
            apt.time === timeStr &&
            apt.status !== 'cancelled'
        );

        if (!isBooked) {
            slots.push(timeStr);
        }
        
        currentTime += duration;
    }

    return slots;
}

// ============================================
// LANGUAGE DATA
// ============================================

const lang = {
    en: {
        login: 'Login',
        selectRole: 'Select Your Role',
        admin: 'Administrator',
        focalPerson: 'Focal Person (Reception)',
        doctor: 'Doctor',
        username: 'Username / Doctor ID',
        password: 'Password',
        loginButton: 'Login',
        invalidCredentials: 'Invalid credentials',
        logout: 'Logout',
        dashboard: 'Dashboard',
        doctors: 'Doctors',
        appointments: 'Appointments',
        settings: 'Settings',
        todayAppointments: "Today's Appointments",
        upcomingAppointments: 'Upcoming Appointments',
        totalAppointments: 'Total Appointments',
        addDoctor: 'Add Doctor',
        editDoctor: 'Edit Doctor',
        deleteDoctor: 'Delete Doctor',
        doctorName: 'Doctor Name',
        specialization: 'Specialization',
        phone: 'Phone',
        email: 'Email',
        workingHours: 'Working Hours',
        startTime: 'Start Time',
        endTime: 'End Time',
        slotDuration: 'Slot Duration (minutes)',
        workingDays: 'Working Days',
        save: 'Save',
        cancel: 'Cancel',
        bookAppointment: 'Book Appointment',
        patientName: 'Patient Name',
        patientPhone: 'Patient Phone',
        reason: 'Reason for Visit',
        selectDoctor: 'Select Doctor',
        selectDate: 'Select Date',
        selectTime: 'Select Time',
        availableSlots: 'Available Slots',
        booked: 'Booked',
        scheduled: 'Scheduled',
        completed: 'Completed',
        cancelled: 'Cancelled',
        status: 'Status',
        actions: 'Actions',
        viewDetails: 'View Details',
        cancelAppointment: 'Cancel Appointment',
        sendWhatsapp: 'Send on WhatsApp',
        whatsappMessage: 'WhatsApp Message',
        selectLanguage: 'Select Language',
        english: 'English',
        urdu: 'اردو',
        messagePreview: 'Message Preview',
        copyMessage: 'Copy Message',
        openWhatsapp: 'Open WhatsApp',
        hospitalInfo: 'Hospital Information',
        hospitalName: 'Hospital Name',
        address: 'Address',
        emailSettings: 'Email Settings',
        enableEmail: 'Enable Email Notifications',
        smtpHost: 'SMTP Host',
        smtpPort: 'SMTP Port',
        smtpUser: 'SMTP Username',
        smtpPassword: 'SMTP Password',
        changePassword: 'Change Password',
        currentPassword: 'Current Password',
        newPassword: 'New Password',
        confirmPassword: 'Confirm Password',
        myAppointments: 'My Appointments',
        noAppointments: 'No appointments found',
        minutes: 'minutes',
        day: 'Day',
        mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun'
    },
    ur: {
        login: 'لاگ ان',
        selectRole: 'اپنا کردار انتخاب کریں',
        admin: 'ایڈمن',
        focalPerson: 'فocal Person (ریسیپشن)',
        doctor: 'ڈاکٹر',
        username: 'یوزر نیم / ڈاکٹر آئی ڈی',
        password: 'پاس ورڈ',
        loginButton: 'لاگ ان کریں',
        invalidCredentials: 'غلط معلومات',
        logout: 'لاگ آؤٹ',
        dashboard: 'ڈیش بورڈ',
        doctors: 'ڈاکٹر',
        appointments: 'اپوائنٹمنٹس',
        settings: 'ترتیبات',
        todayAppointments: 'آج کے اپوائنٹمنٹس',
        upcomingAppointments: 'آنے والے اپوائنٹمنٹس',
        totalAppointments: 'کل اپوائنٹمنٹس',
        addDoctor: 'ڈاکٹر شامل کریں',
        editDoctor: 'ڈاکٹر ترمیم کریں',
        deleteDoctor: 'ڈاکٹر حذف کریں',
        doctorName: 'ڈاکٹر کا نام',
        specialization: 'ماہریت',
        phone: 'فون',
        email: 'ای میل',
        workingHours: 'کام کے اوقات',
        startTime: 'شروع کا وقت',
        endTime: 'ختم کا وقت',
        slotDuration: 'سلوٹ دورانیہ (منٹ)',
        workingDays: 'کام کے دن',
        save: 'محفوظ کریں',
        cancel: 'منسوخ کریں',
        bookAppointment: 'اپوائنٹمنٹ بک کریں',
        patientName: 'مریض کا نام',
        patientPhone: 'مریض کا فون',
        reason: 'ملاقات کا Reason',
        selectDoctor: 'ڈاکٹر انتخاب کریں',
        selectDate: 'تاریخ انتخاب کریں',
        selectTime: 'وقت انتخاب کریں',
        availableSlots: 'دستیاب سلوٹس',
        booked: 'بک',
        scheduled: 'طے شدہ',
        completed: 'مکمل',
        cancelled: 'منسوخ',
        status: 'Status',
        actions: 'کارروائیاں',
        viewDetails: 'تفصیلات دیکھیں',
        cancelAppointment: 'اپوائنٹمنٹ منسوخ کریں',
        sendWhatsapp: 'WhatsApp پر بھیجیں',
        whatsappMessage: 'WhatsApp پیغام',
        selectLanguage: 'زبان انتخاب کریں',
        english: 'English',
        urdu: 'اردو',
        messagePreview: 'پیغام کا Preview',
        copyMessage: 'پیغام کاپی کریں',
        openWhatsapp: 'WhatsApp کھولیں',
        hospitalInfo: 'ہسپتال کی معلومات',
        hospitalName: 'ہسپتال کا نام',
        address: 'Address',
        emailSettings: 'ای میل ترتیبات',
        enableEmail: 'ای میل اطلاعات فعال کریں',
        smtpHost: 'SMTP ہوسٹ',
        smtpPort: 'SMTP پورٹ',
        smtpUser: 'SMTP یوزر',
        smtpPassword: 'SMTP پاس ورڈ',
        changePassword: 'پاس ورڈ تبدیل کریں',
        currentPassword: 'موجودہ پاس ورڈ',
        newPassword: 'نیا پاس ورڈ',
        confirmPassword: 'تصدیق پاس ورڈ',
        myAppointments: 'میرے اپوائنٹمنٹس',
        noAppointments: 'کوئی اپوائنٹمنٹ نہیں',
        minutes: 'منٹ',
        day: 'دن',
        mon: 'پیر', tue: 'منگل', wed: 'بدھ', thu: 'جمعرات', fri: 'جمعہ', sat: 'ہفتہ', sun: 'اتوار'
    }
};

function t(key, langCode = 'en') {
    return lang[langCode][key] || lang.en[key] || key;
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.redirect('/login');
    }
    next();
}

function requireFocal(req, res, next) {
    if (!req.session.user || !['admin', 'manager'].includes(req.session.user.role)) {
        return res.redirect('/login');
    }
    next();
}

function requireDoctor(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'doctor') {
        return res.redirect('/login');
    }
    next();
}

function requireManager(req, res, next) {
    if (!req.session.user || req.session.user.role !== 'manager') {
        return res.redirect('/login');
    }
    next();
}

// ============================================
// PUBLIC ROUTES
// ============================================

app.get('/', (req, res) => {
    res.redirect('/login');
});

app.get('/login', (req, res) => {
    res.render('login', { error: null, lang: req.query.lang || 'en' });
});

app.get('/admin', (req, res) => {
    res.render('admin-login', { error: null });
});

app.get('/doctor-login', (req, res) => {
    res.redirect('/login');
});

app.post('/doctor-login', (req, res) => {
    const { username, password } = req.body;
    const doctors = getDoctors();
    const doctor = doctors.doctors.find(d => d.id === username && d.password === password);
    
    if (doctor) {
        req.session.user = { id: doctor.id, name: doctor.name_en, role: 'doctor', doctorId: doctor.id };
        res.redirect('/doctor/dashboard');
    } else {
        res.render('doctor-login', { error: 'Invalid Doctor ID or Password' });
    }
});

app.post('/admin', (req, res) => {
    const { username, password } = req.body;
    const settings = getSettings();
    
    if (username === settings.admin.username && password === '12345678') {
        req.session.user = { username: username, name: 'Administrator', role: 'admin' };
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin-login', { error: 'Invalid credentials' });
    }
});

app.post('/login', (req, res) => {
    const { username, password, role } = req.body;
    const settings = getSettings();
    let authenticated = false;
    let user = null;

    if (role === 'doctor-portal' || role === 'doctor') {
        const doctors = getDoctors();
        const doctor = doctors.doctors.find(d => d.id === username && d.password === password);
        if (doctor) {
            authenticated = true;
            user = { id: doctor.id, name: doctor.name_en, role: 'doctor', doctorId: doctor.id };
        }
    } else if (role === 'admin') {
        if (username === settings.admin.username && password === '12345678') {
            authenticated = true;
            user = { username: username, name: 'Administrator', role: 'admin' };
        }
    } else if (role === 'manager') {
        if (username === settings.admin.focalUsername && password === settings.admin.focalPassword) {
            authenticated = true;
            user = { username: username, name: 'Manager', role: 'manager' };
        }
    }

    if (authenticated) {
        req.session.user = user;
        if (role === 'doctor') {
            res.redirect('/doctor/dashboard');
        } else if (role === 'manager') {
            res.redirect('/manager/dashboard');
        } else {
            res.redirect('/admin/dashboard');
        }
    } else {
        res.render('login', { error: 'Invalid credentials', lang: req.body.lang || 'en' });
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ============================================
// MANAGER ROUTES
// ============================================

app.get('/manager/dashboard', requireManager, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    const today = new Date().toISOString().split('T')[0];
    
    const todayAppts = appointments.appointments.filter(a => a.date === today);
    const upcomingAppts = appointments.appointments.filter(a => a.date > today && a.status !== 'cancelled');
    
    res.render('manager/dashboard', {
        user: req.session.user,
        todayAppointments: todayAppts,
        upcomingAppointments: upcomingAppts,
        totalAppointments: appointments.appointments.length,
        doctors: doctors.doctors,
        lang: 'en'
    });
});

app.get('/manager/appointments', requireManager, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    
    let filtered = appointments.appointments;
    if (req.query.doctor) {
        filtered = filtered.filter(a => a.doctorId === req.query.doctor);
    }
    if (req.query.date) {
        filtered = filtered.filter(a => a.date === req.query.date);
    }
    if (req.query.status) {
        filtered = filtered.filter(a => a.status === req.query.status);
    }
    
    filtered.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });
    
    res.render('manager/appointments', {
        user: req.session.user,
        appointments: filtered,
        doctors: doctors.doctors,
        filters: req.query,
        lang: 'en'
    });
});

app.get('/manager/book', requireManager, (req, res) => {
    const doctors = getDoctors();
    res.render('manager/book', {
        user: req.session.user,
        doctors: doctors.doctors,
        lang: 'en'
    });
});

app.post('/manager/appointments/book', requireManager, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    const doctor = doctors.doctors.find(d => d.id === req.body.doctorId);
    
    const newAppointment = {
        id: generateAppointmentId(),
        doctorId: req.body.doctorId,
        doctorName: doctor ? doctor.name_en : '',
        patientName: req.body.patientName,
        patientPhone: req.body.patientPhone,
        reason: req.body.reason,
        date: req.body.date,
        time: req.body.time,
        status: 'scheduled',
        createdAt: new Date().toISOString()
    };
    
    appointments.appointments.push(newAppointment);
    saveAppointments(appointments);
    
    res.redirect('/manager/appointments');
});

app.get('/manager/api/slots/:doctorId/:date', requireManager, (req, res) => {
    const slots = getAvailableSlots(req.params.doctorId, req.params.date);
    res.json(slots);
});

app.post('/manager/appointments/update/:id', requireManager, (req, res) => {
    const appointments = getAppointments();
    const index = appointments.appointments.findIndex(a => a.id === req.params.id);
    if (index !== -1) {
        appointments.appointments[index].status = req.body.status;
        saveAppointments(appointments);
    }
    res.redirect('/manager/appointments');
});

app.post('/manager/appointments/cancel/:id', requireManager, (req, res) => {
    const appointments = getAppointments();
    const index = appointments.appointments.findIndex(a => a.id === req.params.id);
    if (index !== -1) {
        appointments.appointments[index].status = 'cancelled';
        saveAppointments(appointments);
    }
    res.redirect('/manager/appointments');
});

app.get('/manager/api/appointment/:id/whatsapp', requireManager, (req, res) => {
    const appointments = getAppointments();
    const settings = getSettings();
    const doctors = getDoctors();
    
    const apt = appointments.appointments.find(a => a.id === req.params.id);
    if (!apt) {
        return res.status(404).json({ error: 'Appointment not found' });
    }
    
    const doctor = doctors.doctors.find(d => d.id === apt.doctorId);
    const hospital = settings.hospital;
    
    res.json({
        appointment: apt,
        doctor: doctor,
        hospital: hospital
    });
});

// Doctor-Wise Report - Only accessible via Admin Dashboard
app.get('/manager/doctor-report', requireManager, (req, res) => {
    res.redirect('/manager/dashboard');
});

// Admin Doctor-Wise Report
app.get('/admin/doctor-report', requireAdmin, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0];
    const startDate = req.query.startDate || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    })();
    
    const filteredAppointments = appointments.appointments.filter(apt => 
        apt.date >= startDate && apt.date <= endDate
    );
    
    const doctorReport = doctors.doctors.map(doctor => {
        const scheduled = filteredAppointments.filter(apt => apt.doctorId === doctor.id && apt.status === 'scheduled');
        const completed = filteredAppointments.filter(apt => apt.doctorId === doctor.id && apt.status === 'completed');
        const cancelled = filteredAppointments.filter(apt => apt.doctorId === doctor.id && apt.status === 'cancelled');
        
        const statusOrder = { 'scheduled': 1, 'completed': 2, 'cancelled': 3 };
        const all = [...scheduled, ...completed, ...cancelled].sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            return statusOrder[a.status] - statusOrder[b.status];
        });
        
        return {
            id: doctor.id,
            name_en: doctor.name_en,
            name_ur: doctor.name_ur,
            specialization_en: doctor.specialization_en,
            specialization_ur: doctor.specialization_ur,
            scheduled: scheduled,
            completed: completed,
            cancelled: cancelled,
            all: all
        };
    }).filter(d => d.scheduled.length > 0 || d.completed.length > 0 || d.cancelled.length > 0);
    
    doctorReport.sort((a, b) => a.name_en.localeCompare(b.name_en));
    
    res.render('manager/doctor-report', {
        user: req.session.user,
        doctorReport: doctorReport,
        startDate: startDate,
        endDate: endDate,
        lang: 'en'
    });
});

// Admin Patient-Wise Report
app.get('/admin/patient-report', requireAdmin, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    
    const searchName = (req.query.searchName || '').toLowerCase();
    const searchPhone = (req.query.searchPhone || '').toLowerCase();
    
    let filteredAppointments = appointments.appointments;
    
    if (searchName) {
        filteredAppointments = filteredAppointments.filter(apt => 
            apt.patientName.toLowerCase().includes(searchName)
        );
    }
    
    if (searchPhone) {
        filteredAppointments = filteredAppointments.filter(apt => 
            apt.patientPhone.toLowerCase().includes(searchPhone)
        );
    }
    
    filteredAppointments.sort((a, b) => b.date.localeCompare(a.date));
    
    const patientMap = new Map();
    filteredAppointments.forEach(apt => {
        const key = apt.patientPhone;
        if (!patientMap.has(key)) {
            patientMap.set(key, {
                patientName: apt.patientName,
                patientPhone: apt.patientPhone,
                appointments: []
            });
        }
        patientMap.get(key).appointments.push(apt);
    });
    
    const patientReport = Array.from(patientMap.values()).sort((a, b) => 
        b.appointments.length - a.appointments.length
    );
    
    res.render('admin/patient-report', {
        user: req.session.user,
        patientReport: patientReport,
        searchName: req.query.searchName || '',
        searchPhone: req.query.searchPhone || '',
        doctors: doctors.doctors,
        lang: 'en'
    });
});

// ADMIN ROUTES
// ============================================

app.get('/admin/dashboard', requireFocal, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    const today = new Date().toISOString().split('T')[0];
    
    const todayAppts = appointments.appointments.filter(a => a.date === today);
    const upcomingAppts = appointments.appointments.filter(a => a.date > today && a.status !== 'cancelled');
    
    res.render('admin/dashboard', {
        user: req.session.user,
        todayAppointments: todayAppts,
        upcomingAppointments: upcomingAppts,
        totalAppointments: appointments.appointments.length,
        doctors: doctors.doctors,
        lang: 'en'
    });
});

app.get('/admin/doctors', requireAdmin, (req, res) => {
    const doctors = getDoctors();
    res.render('admin/doctors', { 
        user: req.session.user, 
        doctors: doctors.doctors,
        lang: 'en'
    });
});

app.post('/admin/doctors/add', requireAdmin, (req, res) => {
    const doctors = getDoctors();
    const newDoctor = {
        id: generateDoctorId(),
        name_en: req.body.name_en,
        name_ur: req.body.name_en,
        specialization_en: req.body.specialization_en,
        specialization_ur: req.body.specialization_en,
        phone: req.body.phone,
        email: req.body.email,
        password: req.body.password || '12345678',
        workingHours: {
            start: req.body.startTime || '09:00',
            end: req.body.endTime || '17:00',
            slotDuration: req.body.slotDuration || '30',
            days: req.body.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        },
        createdAt: new Date().toISOString()
    };
    doctors.doctors.push(newDoctor);
    saveDoctors(doctors);
    res.redirect('/admin/doctors');
});

app.post('/admin/doctors/update/:id', requireAdmin, (req, res) => {
    const doctors = getDoctors();
    const index = doctors.doctors.findIndex(d => d.id === req.params.id);
    if (index !== -1) {
        doctors.doctors[index] = {
            ...doctors.doctors[index],
            name_en: req.body.name_en,
            name_ur: req.body.name_en,
            specialization_en: req.body.specialization_en,
            specialization_ur: req.body.specialization_en,
            phone: req.body.phone,
            email: req.body.email,
            password: req.body.password || doctors.doctors[index].password,
            workingHours: {
                start: req.body.startTime || '09:00',
                end: req.body.endTime || '17:00',
                slotDuration: req.body.slotDuration || '30',
                days: req.body.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
            }
        };
        saveDoctors(doctors);
    }
    res.redirect('/admin/doctors');
});

app.post('/admin/doctors/delete/:id', requireAdmin, (req, res) => {
    const doctors = getDoctors();
    doctors.doctors = doctors.doctors.filter(d => d.id !== req.params.id);
    saveDoctors(doctors);
    res.redirect('/admin/doctors');
});

app.get('/admin/appointments', requireFocal, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    
    let filtered = appointments.appointments;
    if (req.query.doctor) {
        filtered = filtered.filter(a => a.doctorId === req.query.doctor);
    }
    if (req.query.date) {
        filtered = filtered.filter(a => a.date === req.query.date);
    }
    if (req.query.status) {
        filtered = filtered.filter(a => a.status === req.query.status);
    }
    
    filtered.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
    });
    
    res.render('admin/appointments', {
        user: req.session.user,
        appointments: filtered,
        doctors: doctors.doctors,
        filters: req.query,
        lang: 'en'
    });
});

app.post('/admin/appointments/book', requireFocal, (req, res) => {
    const appointments = getAppointments();
    const doctors = getDoctors();
    const doctor = doctors.doctors.find(d => d.id === req.body.doctorId);
    
    const newAppointment = {
        id: generateAppointmentId(),
        doctorId: req.body.doctorId,
        doctorName: doctor ? doctor.name_en : '',
        patientName: req.body.patientName,
        patientPhone: req.body.patientPhone,
        reason: req.body.reason,
        date: req.body.date,
        time: req.body.time,
        status: 'scheduled',
        createdAt: new Date().toISOString()
    };
    
    appointments.appointments.push(newAppointment);
    saveAppointments(appointments);
    
    res.redirect('/admin/appointments');
});

app.post('/admin/appointments/update/:id', requireFocal, (req, res) => {
    const appointments = getAppointments();
    const index = appointments.appointments.findIndex(a => a.id === req.params.id);
    if (index !== -1) {
        appointments.appointments[index].status = req.body.status;
        saveAppointments(appointments);
    }
    res.redirect('/admin/appointments');
});

app.post('/admin/appointments/cancel/:id', requireFocal, (req, res) => {
    const appointments = getAppointments();
    const index = appointments.appointments.findIndex(a => a.id === req.params.id);
    if (index !== -1) {
        appointments.appointments[index].status = 'cancelled';
        saveAppointments(appointments);
    }
    res.redirect('/admin/appointments');
});

app.get('/admin/book', requireFocal, (req, res) => {
    const doctors = getDoctors();
    res.render('admin/book', {
        user: req.session.user,
        doctors: doctors.doctors,
        lang: 'en'
    });
});

app.get('/admin/api/slots/:doctorId/:date', requireFocal, (req, res) => {
    const slots = getAvailableSlots(req.params.doctorId, req.params.date);
    res.json(slots);
});

app.get('/admin/settings', requireAdmin, (req, res) => {
    const settings = getSettings();
    res.render('admin/settings', {
        user: req.session.user,
        settings: settings,
        lang: 'en'
    });
});

app.post('/admin/settings', requireAdmin, (req, res) => {
    const settings = getSettings();
    settings.hospital = {
        name_en: req.body.name_en,
        name_ur: req.body.name_ur,
        address_en: req.body.address_en,
        address_ur: req.body.address_ur,
        phone: req.body.phone
    };
    settings.admin = {
        username: req.body.adminUsername || 'admin',
        focalUsername: req.body.focalUsername || 'reception',
        focalPassword: req.body.focalPassword || 'reception123',
        password: settings.admin.password
    };
    settings.email = {
        enabled: req.body.emailEnabled === 'on',
        host: req.body.emailHost,
        port: req.body.emailPort,
        secure: true,
        user: req.body.emailUser,
        password: req.body.emailPassword,
        to: req.body.emailTo
    };
    saveSettings(settings);
    res.redirect('/admin/settings');
});

app.post('/admin/password', requireAdmin, (req, res) => {
    const settings = getSettings();
    if (req.body.newPassword === req.body.confirmPassword) {
        settings.admin.password = bcrypt.hashSync(req.body.newPassword, 10);
        saveSettings(settings);
    }
    res.redirect('/admin/settings');
});

// ============================================
// DOCTOR ROUTES
// ============================================

app.get('/doctor/dashboard', requireDoctor, (req, res) => {
    const appointments = getAppointments();
    const today = new Date().toISOString().split('T')[0];
    const doctorId = req.session.user.doctorId;
    
    const todayAppts = appointments.appointments.filter(a => 
        a.doctorId === doctorId && a.date === today && a.status !== 'cancelled'
    );
    const upcomingAppts = appointments.appointments.filter(a => 
        a.doctorId === doctorId && a.date > today && a.status !== 'cancelled'
    );
    const pastAppts = appointments.appointments.filter(a => 
        a.doctorId === doctorId && (a.date < today || a.status === 'completed')
    );
    
    res.render('doctor/dashboard', {
        user: req.session.user,
        todayAppointments: todayAppts,
        upcomingAppointments: upcomingAppts,
        pastAppointments: pastAppts,
        lang: 'en'
    });
});

app.post('/doctor/appointments/update/:id', requireDoctor, (req, res) => {
    const appointments = getAppointments();
    const index = appointments.appointments.findIndex(a => a.id === req.params.id);
    if (index !== -1 && appointments.appointments[index].doctorId === req.session.user.doctorId) {
        appointments.appointments[index].status = req.body.status;
        saveAppointments(appointments);
    }
    res.redirect('/doctor/dashboard');
});

// ============================================
// API FOR WHATSAPP
// ============================================

app.get('/api/appointment/:id/whatsapp', requireFocal, (req, res) => {
    const appointments = getAppointments();
    const settings = getSettings();
    const doctors = getDoctors();
    
    const apt = appointments.appointments.find(a => a.id === req.params.id);
    if (!apt) {
        return res.status(404).json({ error: 'Appointment not found' });
    }
    
    const doctor = doctors.doctors.find(d => d.id === apt.doctorId);
    const hospital = settings.hospital;
    
    res.json({
        appointment: apt,
        doctor: doctor,
        hospital: hospital
    });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, () => {
    console.log('========================================');
    console.log('Hospital Doctors Appointment Scheduler');
    console.log('========================================');
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin Panel: http://localhost:${PORT}/admin/dashboard`);
    console.log(`Login: http://localhost:${PORT}/login`);
    console.log('Default Admin: admin / 12345678');
    console.log('========================================');
});
