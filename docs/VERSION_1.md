**VERSION 1**

# 1. Project Overview

#### Developer/s:

> Khaesey Angel Tablante

#### Website Name:

> SCBC Management System
> repo: Khaeshi/BadmintonSystem

#### Current Version:

> 1.0

#### Target Release Date:

> May 2026

#### Project Name/Goal/Purpose:

> South City Recreation Center is a sport center with Badminton, Pickle Ball, and Tennis within the facilties. 
> This system is to solve the repetitive and inneficient costing, manual queueing, and manual booking of the currentn facility.
> The first version is to eradicate first the manual system for the badminton, and the second version will include the fixes and additional feature for multi-tenancy, aswell the solution of a unified court reservation for all sports, and queueing system for badminton(beta).
> Website Name: [badminton-scbc](badminton-scbc.vercel.app) 

# 2. Key Features & Accomplishments in Version 1.0

  ### 2.1 Core Functionality

  -  [ Feature 1: Booking System - Live Court Schedule ]
    > This includes: Select Date -> checking which court number has an open slots -> select the time start of reservation with reserved schedules are blocked -> Fill up form for name, No#. Email(optional), player count, duration, note(special requests), then a view summary section.
  - [ Feature 2: Admin and user login through OAuth]
    > This feature is to verify whether an email is an admin or a user only. This feature will play a good role for user authentications like otp, booking confirmation email, etc. in the future updates.
  - [ Feature 3: Smart Match Pairing a.k.a Queue Matching]
    > This algorithm pairs players by skill tier from A to D and ensures that everyone gets equal court time. This set the players base on the lesser count of matches then pairing through level equality.
  - [ Feature 4: Integrated Biling System ]
    > This feature is connected to the queueing system which handles the  billing of the players added to the system manually.

  ### 2.1 Design & User Experience

  - [ Design Element 1: Implemented responsive design for mobile and desktop ]
    > Using tailwindcss and dynamic css for designing complex ui
  - [ Design Element 2: Color Branding ]
    > While this may not be a final branding, due to multi tenancy prospect in the future, for these version, the current court will represent the branding.
  - [ UX Improvement: Streamlined checkout process ]
  > Queue count now splits the ball into 4 players per match before adding to the tab

  ### 2.3 Technical Achievements

  - [ Milestone 1: Succesful hybrid deployment Vercel/Railway]
    > Vercel for analytics and speed insight is essential for a website with potential 100 to less than equal 200 viewers at peak.
    > Railway has no cost for 1 month and no cold start rather than Render, and has less cost because of "pay as you go" usage which makes it a perfect on the go backend service for this MERN stack
  - [ Milestone 2: Optimize hybrid/static webpages]
    > The system uses a hybrid approach to maintain static preview for SEO friendly and client side render for interaction within the frontend.

# 3. Final Output & Deliverables

 ### 3.1 Website Codebase
  - Repository: [Khaeshi](https://github.com/Khaeshi/badminton-scbc)
  - Branch/Tag: release/v1.0 

 ### 3.2 Deployed Environment
  - Live Url: [https://badminton-scbc.vercel.app](https://badminton-scbc.vercel.app/)

 ### 3.3 Documentation 
  - User Guide: [docs](docs/)
  - API Documentation: N/A
  - Technical Documentation: N/A
  - Test Documentation: N/A

 ### 3.4 Assets
  - Design Files: N/A
  > no assets used yet