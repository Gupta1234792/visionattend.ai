# VisionAttend API Documentation

## Overview

VisionAttend provides a comprehensive RESTful API for managing attendance, users, scheduling, and real-time communication. This documentation covers all available endpoints, request/response formats, and authentication requirements.

## Base URL

```
http://localhost:5000/api
```

## Authentication

VisionAttend uses JWT (JSON Web Token) for authentication. All protected endpoints require a valid JWT token in the Authorization header.

### Authentication Flow

1. **Login**: POST `/auth/login` to obtain JWT token
2. **Include Token**: Add token to subsequent requests
3. **Token Format**: `Bearer <your-jwt-token>`

### Example Authentication

```bash
# Login request
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password123",
    "role": "student"
  }'

# Response
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "user@example.com",
    "role": "student"
  }
}

# Subsequent requests
curl -X GET http://localhost:5000/api/students/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

## API Endpoints

### Authentication Endpoints

#### POST /auth/login
Authenticate user and return JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "role": "admin|hod|coordinator|teacher|student|parent"
}
```

**Response:**
```json
{
  "success": true,
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com",
    "role": "student",
    "collegeId": "college_id",
    "faceRegistered": true
  }
}
```

#### POST /auth/register
Register a new user (invite-based for students).

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "password123",
  "role": "student",
  "inviteToken": "invite_token_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": "user_id",
    "name": "John Doe",
    "email": "john@example.com",
    "role": "student",
    "faceRegistered": false
  }
}
```

#### POST /auth/forgot-password
Request password reset.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

### Face Recognition Endpoints

#### POST /students/face-register
Register student's face for attendance.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEBIVFRUVFRUVFRUVFRUVFRUWFhUWFhUVFRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMwNygtLisBCgoKDg0OGhAQGi0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAKABJQMBIgACEQEDEQH/xAAcAAABBQEBAQAAAAAAAAAAAAAAAQIDBAUGBwj/xABGEAACAQIDBQUEBwYEBwAAAAABAgADEQQSIQUTMUEGIlFhcbEykaGx8AYkQlJicsHRFTNygpLh8RUWJFOC/8QAGgEAAwEBAQEAAAAAAAAAAAAAAAIDBAEFAP/EAC8RAAICAQIEBAMHBQAAAAAAAAABAhEDBCExEkFRYQUTInGBkaGx8CKRwdHh/9oADAMBAAIRAxEAPwDh..."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Face registration successful",
  "faceRegistered": true
}
```

#### POST /students/face-verify
Verify student's face during attendance.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "image": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAkGBxISEhUQEBIVFRUVFRUVFRUVFRUVFRUWFhUWFhUVFRUYHSggGBolHRUVITEhJSkrLi4uFx8zODMwNygtLisBCgoKDg0OGhAQGi0lHyUtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLf/AABEIAKABJQMBIgACEQEDEQH/xAAcAAABBQEBAQAAAAAAAAAAAAAAAQIDBAUGBwj/xABGEAACAQIDBQUEBwYEBwAAAAABAgADEQQSIQUTMUEGIlFhcbEykaGx8AYkQlJicsHRFTNygpLh8RUWJFOC/8QAGgEAAwEBAQEBAQAAAAAAAAAAAAECAwQFBgP/xAAxEQACAQIDBQUEAgMAAAAAAAAAAQIRAyExEkFRYQUTInGBkaGx8CKRwdHh/9oADAMBAAIRAxEAPwDh..."
}
```

**Response:**
```json
{
  "success": true,
  "verified": true,
  "confidence": 0.85
}
```

### Attendance Endpoints

#### POST /attendance/start
Start an attendance session.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "batchId": "batch_id_here",
  "subjectId": "subject_id_here",
  "purpose": "theory|lab|practical"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "session_id_here",
  "startTime": "2024-01-15T10:00:00Z",
  "status": "active"
}
```

#### GET /attendance/active/:batchId
Get active attendance sessions for a batch.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "sessions": [
    {
      "id": "session_id",
      "teacherId": "teacher_id",
      "batchId": "batch_id",
      "subjectId": "subject_id",
      "startTime": "2024-01-15T10:00:00Z",
      "status": "active",
      "purpose": "theory"
    }
  ]
}
```

#### POST /attendance/mark
Mark attendance for a student.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "sessionId": "session_id_here",
  "image": "data:image/jpeg;base64,...",
  "location": {
    "latitude": 12.9716,
    "longitude": 77.5946
  }
}
```

**Response:**
```json
{
  "success": true,
  "attendanceId": "attendance_record_id",
  "status": "present|remote|absent",
  "faceVerification": {
    "success": true,
    "confidence": 0.85
  },
  "location": {
    "distance": 50.5,
    "status": "present"
  }
}
```

#### GET /attendance/records/:studentId
Get attendance records for a student.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "records": [
    {
      "id": "record_id",
      "sessionId": "session_id",
      "timestamp": "2024-01-15T10:15:00Z",
      "status": "present",
      "faceVerification": {
        "success": true,
        "confidence": 0.85
      }
    }
  ]
}
```

### Lecture Endpoints

#### POST /lectures/create
Create a new lecture.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "teacherId": "teacher_id_here",
  "batchId": "batch_id_here",
  "subjectId": "subject_id_here",
  "startTime": "2024-01-15T10:00:00Z",
  "endTime": "2024-01-15T11:00:00Z",
  "purpose": "theory|lab|practical",
  "meetingLink": "https://meet.example.com/lecture"
}
```

**Response:**
```json
{
  "success": true,
  "lectureId": "lecture_id_here",
  "startTime": "2024-01-15T10:00:00Z",
  "status": "scheduled"
}
```

#### GET /lectures/today/:batchId
Get today's lectures for a batch.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "lectures": [
    {
      "id": "lecture_id",
      "teacherId": "teacher_id",
      "batchId": "batch_id",
      "subjectId": "subject_id",
      "startTime": "2024-01-15T10:00:00Z",
      "endTime": "2024-01-15T11:00:00Z",
      "purpose": "theory",
      "meetingLink": "https://meet.example.com/lecture",
      "status": "scheduled"
    }
  ]
}
```

#### GET /lectures/active/:batchId
Get active lectures for a batch.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "lectures": [
    {
      "id": "lecture_id",
      "teacherId": "teacher_id",
      "batchId": "batch_id",
      "subjectId": "subject_id",
      "startTime": "2024-01-15T10:00:00Z",
      "endTime": "2024-01-15T11:00:00Z",
      "purpose": "theory",
      "meetingLink": "https://meet.example.com/lecture",
      "status": "active"
    }
  ]
}
```

### Timetable Endpoints

#### GET /timetables/today/:batchId
Get today's timetable for a batch.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "timetable": {
    "dayOfWeek": 1,
    "periods": [
      {
        "startTime": "09:00",
        "endTime": "09:50",
        "subjectId": "subject_id",
        "teacherId": "teacher_id",
        "type": "lecture"
      }
    ]
  }
}
```

#### POST /timetables/create
Create a new timetable.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "batchId": "batch_id_here",
  "dayOfWeek": 1,
  "periods": [
    {
      "startTime": "09:00",
      "endTime": "09:50",
      "subjectId": "subject_id",
      "teacherId": "teacher_id",
      "type": "lecture"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "timetableId": "timetable_id_here"
}
```

### Notification Endpoints

#### GET /notifications
Get user notifications.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notification_id",
      "title": "Attendance Session Started",
      "message": "New attendance session available",
      "type": "attendance",
      "read": false,
      "createdAt": "2024-01-15T10:00:00Z"
    }
  ]
}
```

#### POST /notifications/read
Mark notifications as read.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Request Body:**
```json
{
  "notificationIds": ["notification_id_1", "notification_id_2"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notifications marked as read"
}
```

### User Management Endpoints

#### GET /students/me
Get current student profile.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "student": {
    "id": "student_id",
    "name": "John Doe",
    "email": "john@example.com",
    "rollNumber": "CS2024001",
    "batchId": "batch_id",
    "faceRegistered": true,
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

#### GET /teachers/me
Get current teacher profile.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "teacher": {
    "id": "teacher_id",
    "name": "Jane Smith",
    "email": "jane@example.com",
    "departmentId": "dept_id",
    "createdAt": "2024-01-01T00:00:00Z"
  }
}
```

### Analytics Endpoints

#### GET /analytics/student/:studentId
Get student analytics.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "analytics": {
    "totalClasses": 50,
    "present": 45,
    "absent": 5,
    "remote": 2,
    "attendanceRate": 90.0,
    "heatmap": [
      {
        "date": "2024-01-01",
        "status": "present"
      }
    ]
  }
}
```

#### GET /analytics/batch/:batchId
Get batch analytics.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "analytics": {
    "totalStudents": 60,
    "averageAttendance": 87.5,
    "lowAttendanceStudents": [
      {
        "studentId": "student_id",
        "name": "Student Name",
        "attendanceRate": 65.0
      }
    ]
  }
}
```

### Health Check Endpoints

#### GET /health
Check backend service health.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "services": {
    "database": "connected",
    "redis": "connected",
    "aiService": "healthy"
  }
}
```

#### GET /health/opencv
Check AI service health.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "message": "OpenCV service is running"
}
```

## Error Responses

All API endpoints return standardized error responses:

```json
{
  "success": false,
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

### Common Error Codes

- `INVALID_CREDENTIALS`: Authentication failed
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid request data
- `AI_SERVICE_ERROR`: Face recognition service error
- `LOCATION_ERROR`: GPS validation failed

## Rate Limiting

The API implements rate limiting to prevent abuse:

- **Authentication endpoints**: 5 requests per minute per IP
- **Face recognition endpoints**: 10 requests per minute per user
- **General endpoints**: 100 requests per minute per user

## WebSocket Events

VisionAttend uses WebSocket for real-time communication. Connect to:

```
ws://localhost:5000
```

### Authentication

Send authentication message after connection:

```json
{
  "type": "auth",
  "token": "your_jwt_token_here"
}
```

### Event Types

#### Attendance Events
```json
{
  "type": "attendance_started",
  "sessionId": "session_id",
  "batchId": "batch_id",
  "subjectId": "subject_id",
  "teacherId": "teacher_id"
}
```

#### Notification Events
```json
{
  "type": "notification",
  "notification": {
    "id": "notification_id",
    "title": "Notification Title",
    "message": "Notification message",
    "type": "attendance|lecture|general"
  }
}
```

#### Chat Events
```json
{
  "type": "chat_message",
  "message": {
    "id": "message_id",
    "senderId": "sender_id",
    "senderName": "Sender Name",
    "content": "Message content",
    "timestamp": "2024-01-15T10:00:00Z"
  }
}
```

## SDK Examples

### JavaScript/Node.js

```javascript
class VisionAttendAPI {
  constructor(baseUrl, token) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async login(email, password, role) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role })
    });
    return response.json();
  }

  async startAttendance(batchId, subjectId, purpose) {
    const response = await fetch(`${this.baseUrl}/attendance/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ batchId, subjectId, purpose })
    });
    return response.json();
  }

  async markAttendance(sessionId, image, location) {
    const response = await fetch(`${this.baseUrl}/attendance/mark`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ sessionId, image, location })
    });
    return response.json();
  }
}
```

### Python

```python
import requests
import json

class VisionAttendAPI:
    def __init__(self, base_url, token=None):
        self.base_url = base_url
        self.token = token

    def login(self, email, password, role):
        response = requests.post(f"{self.base_url}/auth/login", 
                               json={"email": email, "password": password, "role": role})
        return response.json()

    def start_attendance(self, batch_id, subject_id, purpose):
        headers = {"Authorization": f"Bearer {self.token}"}
        data = {"batchId": batch_id, "subjectId": subject_id, "purpose": purpose}
        response = requests.post(f"{self.base_url}/attendance/start", 
                               headers=headers, json=data)
        return response.json()

    def mark_attendance(self, session_id, image, location):
        headers = {"Authorization": f"Bearer {self.token}"}
        data = {"sessionId": session_id, "image": image, "location": location}
        response = requests.post(f"{self.base_url}/attendance/mark", 
                               headers=headers, json=data)
        return response.json()
```

## Versioning

The API follows semantic versioning. Current version: `v1`

Base URL for versioned API:
```
http://localhost:5000/api/v1
```

## Support

For API support and questions:

- **Documentation**: [System Architecture](SYSTEM_ARCHITECTURE.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/visionattend/issues)
- **Email**: webbysuraj@gmail.com