import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDb, getCollection, convertId } from './db.js';
import { config } from './config.js';
import { scanAttendanceForDate } from './detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FRONTEND_DIR = path.join(__dirname, '../frontend');

// Helper to send JSON response
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

// Helper to serve static files
function serveStaticFile(res, filePath) {
  // Prevent directory traversal attacks
  if (!filePath.startsWith(FRONTEND_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/html';
    if (ext === '.css') contentType = 'text/css';
    if (ext === '.js') contentType = 'application/javascript';
    if (ext === '.json') contentType = 'application/json';
    if (ext === '.png') contentType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    if (ext === '.svg') contentType = 'image/svg+xml';
    if (ext === '.ico') contentType = 'image/x-icon';

    res.writeHead(200, { 
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// Main HTTP request router
const server = http.createServer(async (req, res) => {
  // Handle CORS preflight options
  if (req.method === 'OPTIONS') {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    });
    res.end();
    return;
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // --- API Endpoints ---
  
  // POST /api/attendance/scan
  if (req.method === 'POST' && pathname === '/api/attendance/scan') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { date } = JSON.parse(body);
        if (!date) {
          return sendJson(res, 400, { error: 'Date field is required (format: YYYY-MM-DD)' });
        }
        const result = await scanAttendanceForDate(date);
        sendJson(res, 200, result);
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // GET /api/attendance
  if (req.method === 'GET' && pathname === '/api/attendance') {
    try {
      const date = reqUrl.searchParams.get('date');
      if (!date) {
        return sendJson(res, 400, { error: 'Date query parameter is required (YYYY-MM-DD)' });
      }
      
      const attendanceCollection = getCollection('attendance');
      const studentCollection = getCollection('students');
      
      const [records, students] = await Promise.all([
        attendanceCollection.find({ date }).toArray(),
        studentCollection.find({}).toArray()
      ]);
      
      const studentMap = new Map(students.map(s => [s.studentId, s]));
      
      const enrichedRecords = records.map(r => {
        const student = studentMap.get(r.studentId);
        return {
          ...r,
          parentPhone: student ? student.parentPhone : 'N/A',
          grade: student ? student.grade : 'N/A',
          whatsappStatus: r.whatsappStatus || 'Not Sent',
          whatsappSentAt: r.whatsappSentAt || null
        };
      });
      
      sendJson(res, 200, enrichedRecords);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/attendance/:id/whatsapp
  if (req.method === 'POST' && pathname.startsWith('/api/attendance/') && pathname.endsWith('/whatsapp')) {
    const segments = pathname.split('/');
    const id = segments[3];
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const attendanceCollection = getCollection('attendance');
        const records = await attendanceCollection.find({ _id: convertId(id) }).toArray();
        if (records.length === 0) {
          return sendJson(res, 404, { error: 'Attendance record not found.' });
        }
        
        const record = records[0];
        
        await attendanceCollection.updateOne(
          { _id: convertId(id) },
          { 
            $set: { 
              whatsappStatus: 'Sent',
              whatsappSentAt: new Date().toISOString()
            } 
          }
        );
        
        sendJson(res, 200, { 
          success: true, 
          message: `Simulated WhatsApp notification sent to parent of ${record.name} successfully.` 
        });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // GET /api/students
  if (req.method === 'GET' && pathname === '/api/students') {
    try {
      const studentCollection = getCollection('students');
      const students = await studentCollection.find({}).toArray();
      sendJson(res, 200, students);
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/students
  if (req.method === 'POST' && pathname === '/api/students') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { studentId, name, grade, email, parentPhone } = JSON.parse(body);
        if (!studentId || !name || !grade || !email || !parentPhone) {
          return sendJson(res, 400, { error: 'All fields are required' });
        }
        
        const studentCollection = getCollection('students');
        const existing = await studentCollection.find({ studentId }).toArray();
        if (existing.length > 0) {
          return sendJson(res, 400, { error: 'Student ID already exists' });
        }
        
        const newStudent = { studentId, name, grade, email, parentPhone };
        await studentCollection.insertOne(newStudent);
        sendJson(res, 201, { success: true, student: newStudent, message: 'Student added successfully' });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // PUT /api/students/:id
  if (req.method === 'PUT' && pathname.startsWith('/api/students/')) {
    const segments = pathname.split('/');
    const id = segments[3];
    
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { name, grade, email, parentPhone } = JSON.parse(body);
        if (!name || !grade || !email || !parentPhone) {
          return sendJson(res, 400, { error: 'All fields are required' });
        }
        
        const studentCollection = getCollection('students');
        const result = await studentCollection.updateOne(
          { _id: convertId(id) },
          { $set: { name, grade, email, parentPhone } }
        );
        
        if (result.modifiedCount === 0) {
          return sendJson(res, 404, { error: 'Student not found or no changes made' });
        }
        
        sendJson(res, 200, { success: true, message: 'Student updated successfully' });
      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // DELETE /api/students/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/students/')) {
    const segments = pathname.split('/');
    const id = segments[3];
    
    try {
      const studentCollection = getCollection('students');
      const result = await studentCollection.deleteMany({ _id: convertId(id) });
      if (result.deletedCount === 0) {
        return sendJson(res, 404, { error: 'Student not found' });
      }
      sendJson(res, 200, { success: true, message: 'Student deleted successfully' });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // GET /api/flags
  if (req.method === 'GET' && pathname === '/api/flags') {
    try {
      const flagsCollection = getCollection('flagged_issues');
      flagsCollection.find({}).toArray().then(flags => {
        sendJson(res, 200, flags);
      }).catch(err => {
        sendJson(res, 500, { error: err.message });
      });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // POST /api/flags/:id/resolve
  if (req.method === 'POST' && pathname.startsWith('/api/flags/') && pathname.endsWith('/resolve')) {
    const segments = pathname.split('/');
    const id = segments[3]; // format: /api/flags/{id}/resolve -> index 3 is {id}

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { action, value } = JSON.parse(body);
        if (!action) {
          return sendJson(res, 400, { error: 'Action is required in the request body.' });
        }

        const flagsCollection = getCollection('flagged_issues');
        const attendanceCollection = getCollection('attendance');
        const studentCollection = getCollection('students');

        const flags = await flagsCollection.find({ _id: convertId(id) }).toArray();
        if (flags.length === 0) {
          return sendJson(res, 404, { error: 'Flagged issue not found.' });
        }
        const flag = flags[0];

        if (flag.status !== 'Pending') {
          return sendJson(res, 400, { error: `This issue is already resolved with status: ${flag.status}.` });
        }

        let message = '';

        if (action === 'resolve_status') {
          const statusValue = value || 'Present';
          const students = await studentCollection.find({ studentId: flag.studentId }).toArray();
          const studentName = students.length > 0 ? students[0].name : flag.name;
          const parentPhone = students.length > 0 ? students[0].parentPhone : 'N/A';

          const newRecord = {
            studentId: flag.studentId,
            name: studentName,
            date: flag.date,
            status: statusValue,
            timestamp: new Date().toISOString(),
            whatsappStatus: 'Sent',
            whatsappSentAt: new Date().toISOString()
          };

          await attendanceCollection.insertOne(newRecord);
          await flagsCollection.updateOne({ _id: convertId(id) }, { 
            $set: { 
              status: 'Resolved',
              resolvedAt: new Date(),
              resolution: { action, value: statusValue, recordId: newRecord._id }
            } 
          });

          message = `Resolved: Attendance marked as ${statusValue} for ${studentName}. Simulated WhatsApp alert sent to parent at ${parentPhone}.`;

        } else if (action === 'keep_record') {
          const recordIdToKeep = value;
          if (!recordIdToKeep) {
            return sendJson(res, 400, { error: 'Record ID to keep must be specified.' });
          }

          const allRecords = await attendanceCollection.find({ studentId: flag.studentId, date: flag.date }).toArray();
          const keepRecordExists = allRecords.some(r => r._id.toString() === recordIdToKeep.toString());

          if (!keepRecordExists) {
            return sendJson(res, 404, { error: 'Specified attendance record to keep was not found.' });
          }

          let deletedCount = 0;
          for (const record of allRecords) {
            if (record._id.toString() !== recordIdToKeep.toString()) {
              await attendanceCollection.deleteMany({ _id: record._id });
              deletedCount++;
            }
          }

          await attendanceCollection.updateOne(
            { _id: convertId(recordIdToKeep) },
            { 
              $set: { 
                whatsappStatus: 'Sent',
                whatsappSentAt: new Date().toISOString()
              } 
            }
          );

          await flagsCollection.updateOne({ _id: convertId(id) }, { 
            $set: { 
              status: 'Resolved',
              resolvedAt: new Date(),
              resolution: { action, keptRecordId: recordIdToKeep, deletedCount }
            } 
          });

          const students = await studentCollection.find({ studentId: flag.studentId }).toArray();
          const parentPhone = students.length > 0 ? students[0].parentPhone : 'N/A';
          message = `Resolved: Kept check-in log for ${flag.name}. Simulated WhatsApp alert sent to parent at ${parentPhone}.`;

        } else if (action === 'delete_all') {
          const result = await attendanceCollection.deleteMany({ studentId: flag.studentId, date: flag.date });
          await flagsCollection.updateOne({ _id: convertId(id) }, { 
            $set: { 
              status: 'Resolved',
              resolvedAt: new Date(),
              resolution: { action, deletedCount: result.deletedCount || 0 }
            } 
          });

          message = `Resolved: Deleted all attendance records for ${flag.name} on ${flag.date}.`;

        } else if (action === 'ignore') {
          await flagsCollection.updateOne({ _id: convertId(id) }, { 
            $set: { 
              status: 'Ignored',
              resolvedAt: new Date()
            } 
          });
          message = `Ignored flagged issue for ${flag.name} on ${flag.date}.`;
        } else {
          return sendJson(res, 400, { error: `Unsupported action: ${action}` });
        }

        sendJson(res, 200, { success: true, message });

      } catch (err) {
        sendJson(res, 500, { error: err.message });
      }
    });
    return;
  }

  // --- Static Frontend File Serving ---
  
  // Default to index.html for root path
  let targetPath = pathname === '/' ? '/index.html' : pathname;
  const fullPath = path.join(FRONTEND_DIR, targetPath);
  
  serveStaticFile(res, fullPath);
});

// Initialize database then start server
async function start() {
  await connectDb();
  server.listen(config.port, () => {
    console.log(`Server is running on port ${config.port}`);
    console.log(`Open http://localhost:${config.port} in your browser to view the console.`);
  });
}

start().catch(err => {
  console.error('Server startup failed:', err);
});
