const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: 'change-this-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));

// ---------- Folders & Files ----------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
}

const studentsFile = path.join(dataDir, 'students.json');
const adminFile = path.join(dataDir, 'admin.json');

// ---------- Helper functions ----------
function readStudents() {
    if (!fs.existsSync(studentsFile)) return [];
    return JSON.parse(fs.readFileSync(studentsFile, 'utf8') || '[]');
}

function writeStudents(students) {
    fs.writeFileSync(studentsFile, JSON.stringify(students, null, 2));
}

function readAdmin() {
    if (!fs.existsSync(adminFile)) return null;
    return JSON.parse(fs.readFileSync(adminFile, 'utf8') || 'null');
}

function writeAdmin(adminData) {
    fs.writeFileSync(adminFile, JSON.stringify(adminData, null, 2));
}

// ---------- Middleware ----------
const verifyAdmin = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// ---------- Admin Setup / Auth Routes ----------

// Check whether a password has ever been created, and whether this session is logged in
app.get('/api/admin/status', (req, res) => {
    const admin = readAdmin();
    res.json({
        passwordSet: !!admin,
        isAdmin: req.session.isAdmin || false
    });
});

// First-time password creation (only works if no password exists yet)
app.post('/api/admin/setup', (req, res) => {
    const { password } = req.body;
    const admin = readAdmin();

    if (admin) {
        return res.status(400).json({ success: false, message: 'Password already set. Please log in.' });
    }

    if (!password || password.length < 4) {
        return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
    }

    writeAdmin({ password });
    req.session.isAdmin = true;
    res.json({ success: true, message: 'Password created successfully.' });
});

// Login
app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    const admin = readAdmin();

    if (!admin) {
        return res.status(400).json({ success: false, message: 'No password set up yet.' });
    }

    if (password === admin.password) {
        req.session.isAdmin = true;
        res.json({ success: true, message: 'Login successful.' });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect password.' });
    }
});

// Logout
app.post('/api/admin/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Logged out.' });
    });
});

// Change password (must already be logged in, must know current password)
app.post('/api/admin/change-password', verifyAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const admin = readAdmin();

    if (!admin || currentPassword !== admin.password) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ success: false, message: 'New password must be at least 4 characters.' });
    }

    writeAdmin({ password: newPassword });
    res.json({ success: true, message: 'Password changed successfully.' });
});

// ---------- Student Data Routes ----------

// Get all students (admin only)
app.get('/api/admin/students', verifyAdmin, (req, res) => {
    const students = readStudents();
    res.json({ success: true, count: students.length, students });
});

// Delete a student (admin only)
app.delete('/api/admin/students/:id', verifyAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    let students = readStudents();
    const originalLength = students.length;
    students = students.filter(s => s.id !== id);

    if (students.length === originalLength) {
        return res.status(404).json({ success: false, message: 'Student not found' });
    }

    writeStudents(students);
    res.json({ success: true, message: 'Student deleted' });
});

// Submit student info (public form, no login needed, no counts revealed)
app.post('/api/students', (req, res) => {
    const { fullName, program, yearOfStudy, hotel, roomNumber } = req.body;

    if (!fullName || !program || !yearOfStudy || !hotel || !roomNumber) {
        return res.status(400).json({ success: false, message: 'All fields required' });
    }

    const student = {
        id: Date.now(),
        fullName,
        program,
        yearOfStudy,
        hotel,
        roomNumber,
        submittedAt: new Date().toISOString()
    };

    const students = readStudents();
    students.push(student);
    writeStudents(students);

    res.status(201).json({ success: true, message: 'Your information has been recorded.' });
});

// ---------- Page Routes ----------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin: http://localhost:${PORT}/admin`);
});