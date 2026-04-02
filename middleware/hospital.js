const { getHospitalBySlug } = require('../database');

async function hospitalMiddleware(req, res, next) {
    const path = req.path;
    const pathParts = path.split('/').filter(p => p);
    
    if (pathParts.length > 0) {
        const potentialSlug = pathParts[0];
        
        if (potentialSlug && !['login', 'logout', 'api', 'doctor-login', 'admin', 'super-admin'].includes(potentialSlug)) {
            try {
                const hospital = await getHospitalBySlug(potentialSlug);
                if (hospital) {
                    req.hospital = hospital;
                    req.hospitalSlug = hospital.slug;
                    return next();
                }
            } catch (err) {
                console.error('Hospital middleware error:', err);
            }
        }
    }
    
    next();
}

module.exports = hospitalMiddleware;
