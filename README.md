# VisionAttend

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-blue)](https://nextjs.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7.0-green)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-7.x-red)](https://redis.io/)
[![Python](https://img.shields.io/badge/Python-3.10-blue)](https://python.org/)
[![Docker](https://img.shields.io/badge/Docker-24.x-blue)](https://docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🚀 AI-Powered Attendance Management Platform

VisionAttend is a comprehensive, enterprise-grade attendance management platform designed for educational institutions. Built with modern technologies, it combines facial recognition, geolocation validation, and real-time communication to create a secure, efficient, and scalable solution.

### 🎯 Key Features

- **🤖 AI-Powered Face Recognition** - Advanced facial recognition with liveness detection
- **📍 Geolocation Validation** - GPS-based attendance validation with distance thresholds
- **👥 Role-Based Access** - Admin, HOD, Coordinator, Teacher, Student, and Parent roles
- **📱 Real-time Communication** - Live updates via WebSocket connections
- **📊 Comprehensive Analytics** - Heatmap visualization and trend analysis
- **⏰ Smart Scheduling** - Lecture scheduling and automated timetables
- **📧 Intelligent Notifications** - Real-time alerts and announcements
- **🔒 Enterprise Security** - JWT authentication with role-based access control
- **🐳 Containerized Deployment** - Docker-based infrastructure for easy deployment

### 🏗️ Architecture Overview

VisionAttend follows a microservices architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend API   │    │   AI Service    │
│   (Next.js)     │◄──►│   (Node.js)     │◄──►│   (Python)      │
│                 │    │                 │    │                 │
│ • Role Dashboards│    │ • Business Logic│    │ • Face Detection│
│ • Real-time UI  │    │ • Authentication│    │ • Verification  │
│ • Face Capture  │    │ • Data Processing│    │ • Liveness Check│
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Database      │    │   Cache/Queue   │    │   Infrastructure│
│   (MongoDB)     │    │   (Redis)       │    │   (Docker)      │
│                 │    │                 │    │                 │
│ • User Data     │    │ • WebSocket     │    │ • Container     │
│ • Attendance    │    │ • Job Queue     │    │ • Orchestration │
│ • Analytics     │    │ • Caching       │    │ • Load Balancing│
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Frontend** | Next.js 15 | React framework with SSR |
| **Backend** | Node.js 20 + Express | API server and business logic |
| **Database** | MongoDB 7.0 | Document-based data storage |
| **Cache** | Redis 7.x | Real-time communication and caching |
| **AI Service** | Python 3.10 + OpenCV | Facial recognition processing |
| **Real-time** | Socket.IO | WebSocket communication |
| **Infrastructure** | Docker + Docker Compose | Containerization and orchestration |
| **Authentication** | JWT + bcrypt | Secure user authentication |

### 👥 System Roles

VisionAttend supports six distinct user roles, each with specific permissions and capabilities:

#### 🏛️ Admin
- **Full system access** - Complete oversight of all colleges and departments
- **College management** - Create, update, and manage college settings
- **HOD creation** - Assign department heads and manage permissions
- **System analytics** - Monitor overall system performance and usage
- **Audit trail** - Access complete activity logs and system events

#### 👨‍🏫 HOD (Head of Department)
- **Department oversight** - Manage specific academic departments
- **Teacher management** - Create and assign teachers to subjects
- **Coordinator assignment** - Designate batch coordinators
- **Subject mapping** - Link subjects to teachers and departments
- **Department analytics** - Monitor department-specific performance metrics

#### 👩‍💼 Coordinator
- **Batch management** - Handle specific student batches
- **Student onboarding** - Generate invite codes for new students
- **Holiday scheduling** - Create and manage academic holidays
- **Lecture coordination** - Schedule and organize lectures
- **Timetable creation** - Build and publish class schedules

#### 👨‍🏫 Teacher
- **Classroom management** - Start and manage attendance sessions
- **Live monitoring** - View real-time attendance updates
- **Lecture hosting** - Schedule and conduct online lectures
- **Student analytics** - Access detailed performance reports
- **Communication** - Send announcements and messages to students

#### 👨‍🎓 Student
- **Face registration** - Secure biometric enrollment
- **Attendance marking** - Real-time face-based attendance
- **Schedule viewing** - Access personal timetables
- **Analytics dashboard** - Monitor personal attendance trends
- **Notification center** - Receive important updates and alerts

#### 👨‍👩‍👧‍👦 Parent
- **Child monitoring** - Track children's attendance and performance
- **Progress analytics** - View detailed academic reports
- **Communication** - Receive teacher and system notifications
- **Multi-child support** - Monitor multiple children from one account

### 🔄 Attendance Workflow

The attendance system follows a sophisticated, multi-step process:

1. **Session Initiation** 📋
   - Teacher starts attendance session from dashboard
   - System creates session record with batch and subject details
   - Real-time notification sent to all students in the batch

2. **Student Detection** 📱
   - Students receive live attendance notifications
   - Dashboard shows active sessions with countdown timers
   - Students select session and prepare for verification

3. **Biometric Verification** 🤖
   - Student opens camera for face capture
   - System requests location permission for GPS validation
   - Student performs blink verification for liveness detection

4. **AI Processing** 🧠
   - Face image sent to OpenCV AI service
   - System performs face detection and embedding comparison
   - Confidence scoring validates against registered face
   - Liveness detection prevents photo spoofing

5. **Location Validation** 📍
   - GPS coordinates validated against college boundaries
   - Distance calculation determines attendance status:
     - **Green (Present)**: Within college proximity
     - **Yellow (Remote)**: Moderate distance (remote attendance)
     - **Red (Absent/Risky)**: Far distance (invalid location)

6. **Data Storage** 💾
   - Attendance record created with all verification data
   - Real-time update sent to teacher dashboard
   - Student receives confirmation of successful marking

### 📁 Repository Structure

```
visionattend/
├── backend/                    # Node.js API server
│   ├── src/
│   │   ├── controllers/        # Business logic handlers
│   │   ├── models/            # MongoDB schema definitions
│   │   ├── routes/            # API endpoint definitions
│   │   ├── services/          # Business service layer
│   │   ├── middleware/        # Authentication and validation
│   │   └── utils/             # Utility functions
│   ├── server.js              # Main server entry point
│   └── package.json
│
├── frontend/                   # Next.js application
│   ├── app/                   # App router components
│   ├── components/            # Reusable UI components
│   ├── services/              # API client and utilities
│   ├── types/                 # TypeScript type definitions
│   └── package.json
│
├── opencv-ai/                 # Python AI service
│   ├── main.py               # Face recognition API
│   ├── models/               # Pre-trained model files
│   └── requirements.txt
│
├── docker-compose.yaml        # Multi-service orchestration
├── Dockerfile                # Backend container definition
└── README.md                 # This file
```

### 🚀 Quick Start

#### Prerequisites
- Docker and Docker Compose installed
- Node.js 20+ (for development)
- Python 3.10+ (for AI service development)

#### Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-org/visionattend.git
   cd visionattend
   ```

2. **Configure environment**
   ```bash
   # Copy environment files
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env.local
   
   # Edit configuration as needed
   ```

3. **Start services**
   ```bash
   # Start all services with Docker Compose
   docker compose up -d
   
   # View logs
   docker compose logs -f
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - AI Service: http://localhost:10000

#### Manual Development Setup

1. **Backend setup**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. **Frontend setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **AI Service setup**
   ```bash
   cd opencv-ai
   pip install -r requirements.txt
   python main.py
   ```

### 🔧 Configuration

#### Environment Variables

**Backend (.env)**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/visionattend
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key
AI_SERVICE_URL=http://localhost:10000
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_API_URL=http://localhost:5000
NEXT_PUBLIC_AI_URL=http://localhost:10000
NEXT_PUBLIC_DEV_MODE=false
```

**AI Service (environment)**
```env
CONFIDENCE_THRESHOLD=0.7
FACE_MODEL_PATH=./models/arcface_model.get(face_crop)
```

### 📊 Core Modules

#### Authentication & Authorization
- JWT-based authentication with role-based access control
- Secure password hashing with bcrypt
- Session management with Redis
- Email normalization and validation

#### Face Recognition System
- Real-time face detection and verification
- Liveness detection with blink verification
- Confidence threshold validation
- Secure face embedding storage

#### Attendance Management
- Live attendance session management
- Geolocation-based validation
- Real-time status updates
- Comprehensive attendance analytics

#### Scheduling System
- Lecture scheduling and management
- Automated timetable creation
- Holiday and announcement management
- Batch-specific scheduling

#### Real-time Communication
- WebSocket-based live updates
- Real-time notifications
- Chat and messaging functionality
- Live classroom features

#### Analytics & Reporting
- Heatmap visualization of attendance patterns
- Trend analysis and predictions
- Export capabilities (CSV, Excel)
- Role-specific analytics dashboards

### 🚀 Deployment

#### Production Deployment

1. **Build production images**
   ```bash
   docker compose -f docker-compose.prod.yaml build
   ```

2. **Deploy to production**
   ```bash
   docker compose -f docker-compose.prod.yaml up -d
   ```

3. **Configure SSL/TLS**
   - Set up reverse proxy (Nginx)
   - Configure SSL certificates
   - Enable HTTPS termination

#### Scaling Considerations

- **Horizontal Scaling**: Multiple instances of frontend and backend
- **Database Scaling**: MongoDB replica sets for high availability
- **Cache Scaling**: Redis clustering for distributed caching
- **AI Service Scaling**: Multiple AI service instances for load distribution

### 🔮 Future Improvements

#### Short-term Goals
- [ ] Mobile application development (iOS/Android)
- [ ] Advanced analytics with machine learning
- [ ] Integration with existing LMS platforms
- [ ] Enhanced security features (2FA, biometric login)
- [ ] Offline attendance marking capability

#### Long-term Vision
- [ ] Multi-institution support with SaaS architecture
- [ ] Advanced AI features (emotion detection, engagement analysis)
- [ ] Integration with smart campus infrastructure
- [ ] Predictive analytics for student performance
- [ ] Gamification elements for student engagement

#### Technical Enhancements
- [ ] Microservices architecture migration
- [ ] GraphQL API implementation
- [ ] Advanced caching strategies
- [ ] Performance optimization and monitoring
- [ ] Automated testing and CI/CD pipeline

### 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

### 🙏 Acknowledgments

- **OpenCV** - For providing powerful computer vision capabilities
- **InsightFace** - For advanced face recognition models
- **Next.js** - For excellent React framework
- **MongoDB** - For reliable database solution
- **Socket.IO** - For real-time communication

### 📞 Support

For support and questions:

- **Documentation**: [API Documentation](API_DOCUMENTATION.md)
- **Architecture**: [System Architecture](SYSTEM_ARCHITECTURE.md)
- **Issues**: [GitHub Issues](https://github.com/your-org/visionattend/issues)
- **Email**: support@visionattend.com

---

**VisionAttend** - Transforming attendance management with AI and real-time technology 🚀