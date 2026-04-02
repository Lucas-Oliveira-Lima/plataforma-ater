You are a senior full-stack engineer and product designer.

Your task is to build a complete MVP SaaS platform focused on agricultural technical assistance (ATER - Assistência Técnica e Extensão Rural).

The system must be designed for agronomists, technicians, and rural extension agents who perform field visits to producers.

This is NOT a generic farm management system. It is a FIELD OPERATIONS SYSTEM.

-------------------------------------
## 🎯 CORE OBJECTIVE
Build a SaaS platform that allows technicians to:

1. Manage producers and rural properties
2. Perform technical visits in the field (even offline)
3. Record structured agronomic data (text, photo, audio)
4. Generate technical recommendations
5. Automatically generate visit reports (PDF)
6. Create and apply CUSTOM FORMS to producers (VERY IMPORTANT FEATURE)

-------------------------------------
## 🧱 TECH STACK (MANDATORY)

- Frontend: Next.js (React)
- Backend: Supabase (Auth, Postgres, Storage)
- Styling: Tailwind CSS
- Mobile: PWA (must work offline)
- Maps: Leaflet
- State: Zustand or React Context
- Offline support: IndexedDB + sync system

-------------------------------------
## 👥 USER ROLES

- Technician (main user)
- Admin (company/cooperative manager)

-------------------------------------
## 📦 CORE MODULES

-------------------------------------
### 1. AUTHENTICATION
- Login / Register
- Multi-tenant (each user has their own workspace)

-------------------------------------
### 2. PRODUCERS & PROPERTIES

Entities:
- Producer
  - name
  - contact
  - notes

- Property
  - name
  - municipality
  - CAR code (optional)
  - area
  - coordinates (geometry)

Features:
- CRUD for producers and properties
- Map visualization (Leaflet)

-------------------------------------
### 3. FIELD VISITS (CRITICAL MODULE)

Features:
- Start visit (with timestamp + GPS)
- Associate with producer + property
- End visit

During visit:
- Add notes
- Add photos (store in Supabase Storage)
- Add audio recordings
- Add georeferenced points on map

Offline:
- Must work without internet
- Sync later

-------------------------------------
### 4. AGRONOMIC RECORDS

Structured records:
- Type (pest, disease, soil, management)
- Description
- Severity (low, medium, high)
- Attach media

-------------------------------------
### 5. TECHNICAL RECOMMENDATIONS

- Create recommendation linked to visit
- Predefined templates (editable)
- Export as PDF

-------------------------------------
### 6. REPORT GENERATION

- Automatically generate PDF report after visit
- Include:
  - Producer info
  - Property info
  - Visit data
  - Photos
  - Recommendations

-------------------------------------
### 7. 🧩 FORM BUILDER (VERY IMPORTANT)

This is a key differentiator.

Build a dynamic form builder system:

#### Form Builder Features:
- Create custom forms
- Field types:
  - text
  - number
  - select
  - checkbox
  - date
  - photo upload
  - GPS point
- Required fields toggle

#### Form Application:
- Technician selects a form during a visit
- Fills it in the field
- Responses are saved and linked to:
  - visit
  - producer
  - property

#### Data structure:
- forms
- form_fields
- form_responses
- form_answers

#### UI:
- Drag-and-drop builder (simple version acceptable)
- Clean mobile-first interface

-------------------------------------
### 8. OFFLINE-FIRST ARCHITECTURE

- Store data locally using IndexedDB
- Sync queue system:
  - pending uploads
  - conflict handling (basic)
- UI indicator: "offline / synced"

-------------------------------------
### 9. DASHBOARD

- List of visits
- Stats:
  - number of visits
  - producers assisted
- Recent activity

-------------------------------------
## 🎨 UX REQUIREMENTS

- Mobile-first design
- Extremely simple UI (low digital literacy users)
- Large buttons
- Minimal typing (use dropdowns where possible)

-------------------------------------
## 🗂️ DATABASE DESIGN (SUPABASE)

Design normalized tables for:
- users
- producers
- properties
- visits
- records
- recommendations
- forms
- form_fields
- form_responses
- form_answers

-------------------------------------
## 🚀 OUTPUT FORMAT

You must:

1. Generate full project structure
2. Create database schema (SQL)
3. Build frontend pages:
   - login
   - dashboard
   - producers
   - visits
   - form builder
4. Implement API integration with Supabase
5. Implement offline sync logic
6. Provide setup instructions

-------------------------------------
## ⚠️ IMPORTANT

- Code must be production-oriented, not toy examples
- Use clean architecture
- Use reusable components
- Prioritize performance on low-end mobile devices

-------------------------------------

Now start building the MVP step by step.
