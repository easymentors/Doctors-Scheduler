const express = require('express');
const router = express.Router();
const { getAllHospitals, createHospital, initSuperDatabase } = require('../database');

const SUPER_ADMIN_USERNAME = 'superadmin';
const SUPER_ADMIN_PASSWORD = 'HDS@2024!';

router.get('/login', (req, res) => {
    res.render('super-admin/login', { error: null });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD) {
        req.session.superAdmin = true;
        res.redirect('/super-admin/dashboard');
    } else {
        res.render('super-admin/login', { error: 'Invalid credentials' });
    }
});

router.get('/dashboard', async (req, res) => {
    if (!req.session.superAdmin) {
        return res.redirect('/super-admin/login');
    }
    
    try {
        const hospitals = await getAllHospitals();
        res.render('super-admin/dashboard', { hospitals, user: req.session.superAdmin });
    } catch (err) {
        console.error('Error fetching hospitals:', err);
        res.render('super-admin/dashboard', { hospitals: [], user: req.session.superAdmin, error: err.message });
    }
});

router.post('/hospitals/add', async (req, res) => {
    if (!req.session.superAdmin) {
        return res.redirect('/super-admin/login');
    }
    
    const { name, slug, adminUsername, adminPassword } = req.body;
    
    try {
        const hospital = await createHospital(name, slug, adminUsername, adminPassword);
        res.redirect('/super-admin/dashboard');
    } catch (err) {
        console.error('Error creating hospital:', err);
        const hospitals = await getAllHospitals();
        res.render('super-admin/dashboard', { 
            hospitals, 
            user: req.session.superAdmin, 
            error: err.message 
        });
    }
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/super-admin/login');
});

module.exports = router;
