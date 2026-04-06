## Ostim Tech - Google Developer Groups Hackathon '26   04-05.04.2026

# CodeX HealthCare

CodeX HealthCare is a digital health platform that consolidates and interprets a user's health data in a single dashboard. The system provides user profile management, medication search, laboratory report analysis, symptom screening, calendar planning, and notification management — all through a single API.

> Warning: This system is intended for clinical informational purposes only. It is not a substitute for medical diagnosis or treatment.

## System Scope

- Identity management: registration, login, JWT-based session verification
- Profile analysis: AI-powered interpretation from height, weight, age, and gender data
- Medication module: text and image-based medication queries
- Laboratory module: summary and critical value analysis from PDF/image reports
- Symptom screening: Q&A-based risk scoring and explanatory assessment
- Calendar: user-specific event, medication, and reminder records
- Notifications: SMTP email and Expo push token-based mobile notifications
- Map integration: nearby hospital/pharmacy information and location-based auxiliary services
- Game module: score saving and history viewing for cognitive games

## Architecture Overview

The system consists of two main layers:

1. `frontend`: React + Vite-based client interface
2. `backend`: Express-based REST API and business logic

The data layer runs on MySQL. File uploads, JWT verification, cron-based reminder jobs, and AI calls are all managed centrally on the backend.

## Core Technologies

- Frontend: React, Vite, Tailwind CSS, Axios
- Backend: Node.js, Express, mysql2, jsonwebtoken, bcryptjs, multer
- Scheduling/Notifications: node-cron, nodemailer, Expo Push API
- AI/Analysis: Google Gemini
- Map/Location: OpenStreetMap, Overpass API, client-side location services

## Modules and Functions

### User and Session

- User registration and login
- JWT-protected endpoint access
- Profile data storage and updates

### Clinical Support Layer

- Medication search and identification from medication images
- Laboratory report analysis and structured output
- Symptom screening scenarios and risk scoring

### Calendar and Notifications

- Calendar event creation, update, and deletion
- Scheduled email reminders
- Push notification delivery to devices (registered Expo tokens)

### Interactions and Games

- Per-user game score storage
- Historical listing of results

## Data Model Summary

The `database` folder contains the core SQL files for the system. The structure primarily covers the following areas:

- User and profile information
- User interaction records (analysis, screening, etc.)
- Calendar events
- Game score history
- Notification token and dedupe log records
- Symptom screening condition/question/option datasets

## Documentation Files

- `apis.md`: endpoint contracts, JWT, multipart fields
- `mail_notify.md`: email and push reminder flows
- `calendar_questions.md`: calendar and symptom screening integration notes
- `MOBIL_ENTEGRASYON_PROMPT.md`: integration instructions for mobile client development

## Security and Disclaimer Notes

- JWT, SMTP, and API keys must be protected on the server side only.
- Due to the nature of health data, the use of secure channels for transmission is essential.
- AI outputs are supplementary in nature and must not be used as a clinical decision-making mechanism.

## Developer Team

- Yusuf Türker ALBAYRAK [https://github.com/TurkerAlbayrak]
- Hasan Erman DAĞ [https://github.com/hasanerman]
- Mir Mehmet PEKER [https://github.com/mirmehmet]