# VisionAttend System Architecture

## 1. System Overview

VisionAttend is a comprehensive, AI-powered attendance management platform designed for educational institutions. The system combines facial recognition, geolocation validation, and real-time communication to create a secure, efficient attendance system.

### Core Services

- **Frontend Service**: Next.js application serving role-based dashboards
- **Backend API**: Node.js/Express API handling business logic and data processing
- **AI Service**: Python-based OpenCV service for facial recognition and verification
- **Database Service**: MongoDB for persistent data storage
- **Cache/Queue Service**: Redis for real-time communication and job queuing
- **WebSockets**: Socket.io for real-time notifications and live updates

## 2. High Level Architecture

The system follows a microservices architecture with clear separation of concerns:

### Frontend Layer (Next.js)
- Role-based dashboards for Admin, HOD, Coordinator, Teacher, Student, and Parent
- Real-time updates via WebSocket connections
- Face registration and verification UI components
- Responsive design for desktop and mobile access

### Backend Layer (Node.js + Express)
- RESTful API endpoints for all business operations
- JWT-based authentication and authorization
- Business logic for attendance management, scheduling, and analytics
- Integration layer between frontend and AI services
- WebSocket server for real-time communication

### AI Processing Layer (Python + OpenCV)
- Face registration and embedding creation
- Real-time face verification with confidence scoring
- Liveness detection (blink verification)
- Face recognition model serving with InsightFace and ONNX Runtime

### Data Layer
- **MongoDB**: Primary database for user data, attendance records, schedules, and analytics
- **Redis**: Caching layer, WebSocket message broker, and job queue management

### Infrastructure Layer
- Docker containers for service isolation and deployment
- Docker Compose for orchestration and service coordination
- Environment-based configuration management

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                           │
│                    (Next.js Application)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Admin     │  │   Teacher   │  │   Student   │              │
│  │ Dashboard   │  │ Dashboard   │  │ Dashboard   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                                ↓ HTTPS/WebSocket
┌─────────────────────────────────────────────────────────────────┐
│                       Backend Layer                             │
│                   (Node.js + Express API)                       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Authentication  │  Attendance  │  Scheduling  │  Analytics │ │
│  │     Service      │    Service   │   Service    │   Service  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                    WebSocket Server                         │ │
│  │                (Socket.io Integration)                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                ↓ HTTP API
┌─────────────────────────────────────────────────────────────────┐
│                      AI Processing Layer                        │
│                 (Python + OpenCV + InsightFace)                 │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  Face Registration  │  Face Verification  │  Health Check   │ │
│  │      Service        │       Service       │     Service     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                ↓ Database Operations
┌─────────────────────────────────────────────────────────────────┐
│                         Data Layer                              │
│  ┌─────────────────┐              ┌─────────────────────────────┐ │
│  │   MongoDB       │              │         Redis               │ │
│  │                 │              │                             │ │
│  │ • Users         │              │ • WebSocket Messages        │ │
│  │ • Attendance    │              │ • Job Queue (Reminders)     │ │
│  │ • Lectures      │              │ • Caching                   │ │
│  │ • Timetables    │              │ • Session Management        │ │
│  │ • Analytics     │              │                             │ │
│  └─────────────────┘              └─────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                                ↓ Container Orchestration
┌─────────────────────────────────────────────────────────────────┐
│                      Infrastructure Layer                       │
│                    (Docker + Docker Compose)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ Frontend    │  │ Backend     │  │ AI Service  │              │
│  │ Container   │  │ Container   │  │ Container   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ MongoDB     │  │ Redis       │  │ Nginx       │              │
│  │ Container   │  │ Container   │  │ Container   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘

## 4. Service Responsibilities

### Frontend Service (Next.js)
- **Role**: User interface and client-side logic
- **Responsibilities**:
  - Serve role-based dashboards (Admin, HOD, Coordinator, Teacher, Student, Parent)
  - Handle user authentication and session management
  - Manage real-time updates via WebSocket connections
  - Provide face registration and verification UI components
  - Handle form validation and user interactions
  - Responsive design for desktop and mobile devices
- **Key Features**:
  - Server-side rendering for SEO and performance
  - Client-side routing for smooth navigation
  - State management for complex UI interactions
  - File upload handling for face registration

### Backend API Service (Node.js + Express)
- **Role**: Business logic and data processing layer
- **Responsibilities**:
  - Handle all RESTful API endpoints
  - JWT-based authentication and authorization
  - Business logic for attendance management, scheduling, and analytics
  - Integration with AI service for face recognition
  - Database operations and data validation
  - WebSocket server for real-time communication
  - Email notifications and job queue management
- **Key Features**:
  - Role-based access control middleware
  - Input validation and sanitization
  - Error handling and logging
  - Rate limiting and security measures
  - API versioning and documentation

### AI Processing Service (Python + OpenCV)
- **Role**: Facial recognition and verification processing
- **Responsibilities**:
  - Face registration and embedding creation
  - Real-time face verification with confidence scoring
  - Liveness detection (blink verification)
  - Face recognition model serving with InsightFace and ONNX Runtime
  - Health check endpoints for service monitoring
- **Key Features**:
  - High-performance face detection and recognition
  - Confidence threshold validation
  - Secure face embedding storage
  - Real-time processing capabilities
  - Model versioning and updates

### Database Service (MongoDB)
- **Role**: Persistent data storage and retrieval
- **Responsibilities**:
  - Store user accounts and authentication data
  - Maintain attendance records and session history
  - Store lecture schedules, timetables, and announcements
  - Handle analytics data and reporting information
  - Manage notification history and preferences
- **Key Features**:
  - Document-based storage for flexible schema
  - Indexing for performance optimization
  - Aggregation framework for complex queries
  - Replication and backup capabilities
  - Role-based access control

### Cache/Queue Service (Redis)
- **Role**: Caching layer and real-time communication
- **Responsibilities**:
  - WebSocket message brokering for real-time updates
  - Job queue management for email notifications and reminders
  - Caching frequently accessed data for performance
  - Session management and temporary data storage
  - Rate limiting and request throttling
- **Key Features**:
  - In-memory data structure store
  - Pub/sub messaging for real-time communication
  - Job queue processing with BullMQ
  - TTL-based cache management
  - High availability and clustering

### WebSocket Service (Socket.io)
- **Role**: Real-time bidirectional communication
- **Responsibilities**:
  - Live attendance session updates
  - Real-time notifications for announcements and alerts
  - Lecture status updates and scheduling changes
  - Chat and messaging functionality
  - Live classroom features and student interactions
- **Key Features**:
  - Automatic reconnection handling
  - Room-based communication for different user groups
  - Event-driven architecture for real-time updates
  - Cross-platform compatibility
  - Scalable for multiple concurrent connections

## 5. Authentication Architecture

### JWT-Based Authentication System
VisionAttend implements a robust JWT (JSON Web Token) authentication system with role-based access control:

#### Authentication Flow
1. **User Login**: User provides email and password
2. **Credential Validation**: Backend validates credentials against MongoDB
3. **JWT Generation**: System creates JWT with user ID, role, and expiration
4. **Token Storage**: Frontend stores JWT in secure HTTP-only cookies
5. **Subsequent Requests**: JWT automatically included in API requests
6. **Token Verification**: Backend middleware validates JWT on each request

#### Role-Based Access Control (RBAC)
- **Role Hierarchy**: Admin > HOD > Coordinator > Teacher > Student > Parent
- **Permission Levels**: Each role has specific permissions and data access
- **Route Protection**: Middleware ensures users can only access authorized endpoints
- **Data Isolation**: Users only see data relevant to their role and scope

#### Security Features
- **Password Hashing**: bcrypt with salt rounds for secure password storage
- **Token Expiration**: Automatic token expiration with refresh mechanisms
- **Session Management**: Redis-based session tracking and invalidation
- **Email Normalization**: Consistent email handling to prevent duplicate accounts
- **Role Locking**: Users can only log in with their designated role

## 6. Attendance Pipeline

### Step-by-Step System Flow

#### 1. Teacher Starts Attendance
- Teacher navigates to class dashboard and clicks "Start Attendance"
- Backend creates new `AttendanceSession` record in MongoDB
- Session includes: teacher ID, batch ID, subject, start time, status
- WebSocket event emitted to notify students in the batch

#### 2. Session Creation and Notification
- Backend stores session details in MongoDB
- Redis pub/sub system broadcasts session start to relevant students
- Students receive real-time notification via WebSocket connection
- Session appears in student dashboards as "Live Attendance"

#### 3. Student Detects Session
- Student dashboard shows active attendance sessions
- Student clicks "Mark Attendance" for the active session
- Frontend requests session details from backend
- System validates student eligibility for the session

#### 4. Student Scans Face
- Student opens camera interface for face capture
- System requests location permission for geolocation validation
- Student positions face in frame and blinks for liveness detection
- Face image and GPS coordinates captured simultaneously

#### 5. AI Verification Process
- Face image sent to OpenCV AI service via HTTP API
- AI service performs:
  - Face detection and alignment
  - Face embedding generation
  - Confidence scoring against registered face
  - Liveness detection validation
- AI service returns verification result with confidence score

#### 6. Location Validation
- System calculates distance between student GPS and college coordinates
- Distance-based status assignment:
  - **Green (Present)**: Within college proximity
  - **Yellow (Remote)**: Moderate distance (remote attendance)
  - **Red (Absent/Risky)**: Far distance (invalid location)
- Location accuracy validation to ensure reliable GPS data

#### 7. Attendance Storage
- Backend creates `AttendanceRecord` with:
  - Student ID, session ID, timestamp
  - Face verification result and confidence score
  - Location coordinates and distance calculation
  - Final attendance status (Present/Remote/Absent)
- Real-time update sent to teacher dashboard via WebSocket
- Student receives confirmation of attendance marking

## 7. Face Recognition Pipeline

### Face Registration Process
1. **Image Capture**: Student uploads clear face image via camera
2. **Preprocessing**: AI service normalizes image (size, lighting, alignment)
3. **Face Detection**: OpenCV detects face boundaries and key facial landmarks
4. **Embedding Creation**: InsightFace model generates unique face embedding vector
5. **Storage**: Face embedding stored securely in MongoDB with student ID
6. **Validation**: System verifies embedding quality and confidence threshold

### Face Verification Process
1. **Live Capture**: Student captures live face image during attendance
2. **Preprocessing**: Same normalization as registration process
3. **Embedding Generation**: Create embedding for live face
4. **Comparison**: Compare live embedding against stored registration embedding
5. **Confidence Scoring**: Calculate similarity score between embeddings
6. **Threshold Validation**: Verify score meets minimum confidence (default 0.7)
7. **Liveness Detection**: Validate blink detection to prevent photo spoofing
8. **Result**: Return verification success/failure with confidence score

### Confidence Threshold System
- **Default Threshold**: 0.7 (70% similarity required)
- **Adjustable**: Can be configured based on security requirements
- **Fallback**: Manual verification option for low-confidence matches
- **Security**: Prevents false positives while maintaining usability

## 8. Realtime System

### Socket.IO Implementation
VisionAttend uses Socket.IO for real-time communication across all services:

#### Connection Management
- **Persistent Connections**: WebSocket connections maintained for active users
- **Automatic Reconnection**: Handles network interruptions gracefully
- **Room-Based Communication**: Users join rooms based on roles and batches
- **Connection Scaling**: Supports thousands of concurrent connections

#### Real-time Events
- **Attendance Notifications**: Live updates when sessions start/end
- **Lecture Updates**: Real-time scheduling changes and announcements
- **Chat Messages**: Instant messaging between teachers and students
- **System Alerts**: Important notifications and system status updates

#### Event Types
- **Session Events**: Attendance session lifecycle (start, update, end)
- **Notification Events**: User-specific and broadcast notifications
- **Chat Events**: Message sending, delivery confirmation, typing indicators
- **Status Events**: User online/offline status and presence

## 9. Database Design Overview

### Core Entities

#### Users Collection
```javascript
{
  _id: ObjectId,
  name: String,
  email: String,
  password: String, // bcrypt hashed
  role: String, // 'admin', 'hod', 'coordinator', 'teacher', 'student', 'parent'
  collegeId: ObjectId,
  departmentId: ObjectId, // optional
  batchId: ObjectId, // optional for students
  faceRegisteredAt: Date, // optional
  createdAt: Date,
  updatedAt: Date
}
```

#### Attendance Records Collection
```javascript
{
  _id: ObjectId,
  studentId: ObjectId,
  sessionId: ObjectId,
  timestamp: Date,
  faceVerification: {
    success: Boolean,
    confidence: Number,
    message: String
  },
  location: {
    coordinates: [Number, Number], // [longitude, latitude]
    distance: Number, // meters from college
    status: String // 'present', 'remote', 'absent'
  },
  status: String, // 'present', 'remote', 'absent'
  createdAt: Date
}
```

#### Attendance Sessions Collection
```javascript
{
  _id: ObjectId,
  teacherId: ObjectId,
  batchId: ObjectId,
  subjectId: ObjectId,
  startTime: Date,
  endTime: Date,
  status: String, // 'active', 'completed', 'cancelled'
  purpose: String, // 'theory', 'lab', 'practical'
  createdAt: Date
}
```

#### Lectures Collection
```javascript
{
  _id: ObjectId,
  teacherId: ObjectId,
  batchId: ObjectId,
  subjectId: ObjectId,
  startTime: Date,
  endTime: Date,
  purpose: String,
  meetingLink: String,
  status: String,
  createdAt: Date
}
```

#### Timetables Collection
```javascript
{
  _id: ObjectId,
  batchId: ObjectId,
  dayOfWeek: Number, // 0-6 (Sunday-Saturday)
  periods: [
    {
      startTime: String, // "09:00"
      endTime: String,   // "09:50"
      subjectId: ObjectId,
      teacherId: ObjectId,
      type: String // 'lecture', 'lab', 'practical'
    }
  ],
  createdAt: Date,
  publishedAt: Date
}
```

### Database Relationships
- **One-to-Many**: College → Departments → Batches → Students
- **Many-to-Many**: Teachers ↔ Subjects (via assignments)
- **One-to-Many**: Attendance Sessions → Attendance Records
- **Many-to-One**: Students → Parents (via email linking)

### Indexing Strategy
- **Email Index**: Unique index on user emails for fast authentication
- **Compound Indexes**: Optimized queries for attendance and scheduling
- **Geospatial Index**: MongoDB geospatial index for location queries
- **TTL Indexes**: Automatic cleanup of temporary data and logs

## 10. Deployment Architecture

### Docker-Based Containerization

#### Container Services
- **Frontend Container**: Next.js application with Nginx reverse proxy
- **Backend Container**: Node.js API with PM2 process manager
- **AI Service Container**: Python OpenCV service with Gunicorn server
- **MongoDB Container**: Database service with persistent volume
- **Redis Container**: Cache and message broker with persistence
- **Nginx Container**: Load balancer and reverse proxy

#### Docker Compose Configuration
```yaml
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]
    environment:
      - NEXT_PUBLIC_API_URL=http://backend:5000
      - NEXT_PUBLIC_AI_URL=http://opencv-ai:10000
  
  backend:
    build: ./backend
    ports: ["5000:5000"]
    environment:
      - MONGODB_URI=mongodb://mongo:27017/visionattend
      - REDIS_URL=redis://redis:6379
      - AI_SERVICE_URL=http://opencv-ai:10000
  
  opencv-ai:
    build: ./opencv-ai
    ports: ["10000:10000"]
    environment:
      - CONFIDENCE_THRESHOLD=0.7
  
  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
  
  redis:
    image: redis:7
    volumes:
      - redis_data:/data

volumes:
  mongo_data:
  redis_data:
```

#### Environment Configuration
- **Development**: Local Docker Compose with hot reloading
- **Staging**: Docker Compose with staging-specific configurations
- **Production**: Docker Compose with production optimizations
- **Environment Variables**: Secure configuration management across environments

#### Deployment Strategy
- **Container Orchestration**: Docker Compose for multi-service coordination
- **Health Checks**: Container health monitoring and auto-restart
- **Volume Persistence**: Data persistence across container restarts
- **Network Isolation**: Internal networking between services
- **Load Balancing**: Nginx for frontend load distribution
- **SSL/TLS**: HTTPS termination and certificate management

#### Scaling Considerations
- **Horizontal Scaling**: Multiple instances of frontend and backend
- **Database Scaling**: MongoDB replica sets for high availability
- **Cache Scaling**: Redis clustering for distributed caching
- **AI Service Scaling**: Multiple AI service instances for load distribution
- **Monitoring**: Container health and performance monitoring
