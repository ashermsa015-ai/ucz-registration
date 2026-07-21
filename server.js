require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const { MongoClient } = require('mongodb');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'change-this-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 }
}));

// ---------- MongoDB connection ----------
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);
let studentsCollection;
let adminCollection;

async function connectDB() {
    try {
        await client.connect();
        const db = client.db();
        studentsCollection = db.collection('students');
        adminCollection = db.collection('admin');
        console.log('Connected to MongoDB successfully.');
    } catch (err) {
        console.error('Failed to connect to MongoDB:', err);
    }
}
connectDB();

async function getAdminSettings() {
    return adminCollection.findOne({ _id: 'settings' });
}

// ---------- Middleware ----------
const verifyAdmin = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    next();
};

// ---------- Admin Setup / Auth Routes ----------

app.get('/api/admin/status', async (req, res) => {
    try {
        const admin = await getAdminSettings();
        res.json({
            passwordSet: !!admin,
            isAdmin: req.session.isAdmin || false
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error checking status.' });
    }
});

app.post('/api/admin/setup', async (req, res) => {
    try {
        const { password } = req.body;
        const admin = await getAdminSettings();

        if (admin) {
            return res.status(400).json({ success: false, message: 'Password already set. Please log in.' });
        }

        if (!password || password.length < 4) {
            return res.status(400).json({ success: false, message: 'Password must be at least 4 characters.' });
        }

        await adminCollection.insertOne({ _id: 'settings', password });
        req.session.isAdmin = true;
        res.json({ success: true, message: 'Password created successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error creating password.' });
    }
});

app.post('/api/admin/login', async (req, res) => {
    try {
        const { password } = req.body;
        const admin = await getAdminSettings();

        if (!admin) {
            return res.status(400).json({ success: false, message: 'No password set up yet.' });
        }

        if (password === admin.password) {
            req.session.isAdmin = true;
            res.json({ success: true, message: 'Login successful.' });
        } else {
            res.status(401).json({ success: false, message: 'Incorrect password.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error logging in.' });
    }
});

app.post('/api/admin/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true, message: 'Logged out.' });
    });
});

app.post('/api/admin/change-password', verifyAdmin, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const admin = await getAdminSettings();

        if (!admin || currentPassword !== admin.password) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
        }

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ success: false, message: 'New password must be at least 4 characters.' });
        }

        await adminCollection.updateOne(
            { _id: 'settings' },
            { $set: { password: newPassword } }
        );
        res.json({ success: true, message: 'Password changed successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error changing password.' });
    }
});

// ---------- Student Data Routes ----------

app.get('/api/admin/students', verifyAdmin, async (req, res) => {
    try {
        const students = await studentsCollection.find().sort({ submittedAt: -1 }).toArray();
        res.json({ success: true, count: students.length, students });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error fetching students.' });
    }
});

app.delete('/api/admin/students/:id', verifyAdmin, async (req, res) => {
    try {
        const id = req.params.id;
        const result = await studentsCollection.deleteOne({ id: id });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Student not found' });
        }

        res.json({ success: true, message: 'Student deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error deleting student.' });
    }
});

// Submit student info (public form, no login needed, no counts revealed)
app.post('/api/students', async (req, res) => {
    try {
        const {
            fullName, phoneNumber, whatsappNumber,
            program, yearOfStudy, hotel, roomNumber,
            guardianTitle, guardianName, guardianPhone
        } = req.body;

        if (!fullName || !phoneNumber || !whatsappNumber ||
            !program || !yearOfStudy || !hotel || !roomNumber ||
            !guardianTitle || !guardianName || !guardianPhone) {
            return res.status(400).json({ success: false, message: 'All fields required' });
        }

        const student = {
            fullName,
            phoneNumber,
            whatsappNumber,
            program,
            yearOfStudy,
            hotel,
            roomNumber,
            guardianTitle,
            guardianName,
            guardianPhone,
        };

        await studentsCollection.insertOne(student);

        res.status(201).json({ success: true, message: 'information recorded Muli Bantu Sana.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Error saving your information.' });
    }
});

// ---------- Page Routes ----------
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
