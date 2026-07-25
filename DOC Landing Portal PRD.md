# **DOC Unified Digital Platform**

# **Product Requirements Document (PRD)**

# **Module 4 – Public Landing Portal**

**Version:** 1.0

**Status:** Planning Complete

**Dependencies:**

* Master Platform PRD  
* Shared Content Engine  
* Clubs Management Portal PRD  
* Department Information Module  
* Shared Media Library

---

# **1\. Overview**

## **1.1 Purpose**

The Public Landing Portal is the public-facing website of the Department of Commerce (DOC), CHRIST (Deemed to be University).

Its sole purpose is to introduce the department, showcase its academic offerings and provide visitors with essential public information before directing authenticated users to the DOC Unified Digital Platform.

The Landing Portal is intentionally lightweight and informational. It is not an operational system and does not provide access to internal departmental workflows.

---

## **1.2 Vision**

To provide a modern, visually appealing and low-maintenance public website that accurately represents the Department of Commerce while seamlessly connecting users to the DOC Unified Digital Platform.

---

## **1.3 Objectives**

The Landing Portal shall:

* Present the Department professionally.  
* Showcase academic programmes.  
* Introduce departmental clubs.  
* Display public statistics.  
* Provide department contact information.  
* Showcase departmental achievements through imagery.  
* Direct users to the authenticated platform.  
* Require almost no ongoing maintenance.

---

# **2\. Scope**

## **Included**

* Homepage  
* About Department  
* Course Catalogue  
* Clubs Showcase  
* Gallery  
* Contact Page  
* Public Statistics  
* Login Redirect

## **Excluded**

The Landing Portal shall not include:

* Authentication  
* Student dashboard  
* Faculty dashboard  
* Club operations  
* Attendance claims  
* Public events  
* Event registration  
* Faculty directory  
* Announcements  
* Public search  
* Public forms  
* Visitor analytics  
* Operational workflows

---

# **3\. Design Philosophy**

## **3.1 Informational Only**

The Landing Portal exists solely to present information.

It shall never become an operational application.

---

## **3.2 Minimal Maintenance**

Almost all content should originate from shared platform services.

The Landing Portal should not require its own administrative interface.

---

## **3.3 Lightweight**

The application should prioritize:

* Fast loading  
* Simple navigation  
* Minimal clicks  
* Responsive layouts

---

## **3.4 Premium Visual Experience**

The Landing Portal should reflect the visual identity of the DOC Unified Digital Platform through:

* Apple-inspired layouts  
* Smooth transitions  
* Premium micro-animations  
* Glass-inspired UI elements  
* Clean typography  
* Minimal visual clutter

---

# **4\. Architecture**

The Landing Portal functions as a presentation layer.

It consumes public content from platform services but owns no operational data.

Examples:

* Department statistics  
* Club information  
* Course information  
* Gallery images

No business logic resides within the Landing Portal.

---

# **5\. Users**

The Landing Portal serves:

* Prospective Students  
* Current DOC Students  
* Parents  
* Recruiters & Industry Partners  
* General Public

Faculty members access authenticated modules directly after login.

---

# **6\. Navigation**

Primary navigation consists of:

* Home  
* About  
* Courses  
* Clubs  
* Gallery  
* Contact

The navigation remains fixed across all pages.

---

# **7\. Homepage**

## **Purpose**

The homepage provides a concise overview of the Department.

Visitors should understand the department within the first few seconds of visiting the website.

---

## **Homepage Structure**

1. Hero Banner  
2. Department Statistics  
3. Courses  
4. Clubs Showcase  
5. About Department  
6. Gallery Preview  
7. Contact Section  
8. Footer

---

# **8\. Hero Section**

The Hero Section consists of:

* Full-width department imagery  
* Department title  
* Short departmental tagline  
* Primary CTA

Primary Call-to-Action:

**DOC Portal Login**

The CTA redirects authenticated users to the ERP login.

---

# **9\. Department Statistics**

The homepage displays:

* Total Students  
* Faculty Count  
* Number of Clubs  
* Years of Department

Statistics are informational and maintained administratively.

Version 1 does not synchronize statistics automatically from operational data.

---

# **10\. About Department**

The About section provides:

* Department overview  
* Vision  
* Mission  
* Brief history  
* Core strengths

Content is static and changes infrequently.

---

# **11\. Courses**

## **Purpose**

The Courses section introduces every programme offered by the Department.

---

## **Course Cards**

Each course card displays:

* Course Name  
* Brief Description  
* Download Brochure

Cards remain concise and visually consistent.

---

## **Course Details**

Selecting a course opens a dedicated information page containing:

* Programme overview  
* Learning outcomes  
* Career opportunities  
* Downloadable brochure

The page remains informational only.

---

# **12\. Clubs Showcase**

## **Purpose**

Introduce departmental clubs without exposing internal operations.

---

## **Club Cards**

Each club card contains:

* Logo  
* Short Description  
* Social Media Links

Club cards intentionally omit:

* Member lists  
* Faculty details  
* Events  
* Registrations  
* Operational information

The Landing Portal does not provide dedicated club pages.

---

# **13\. Gallery**

## **Purpose**

The Gallery showcases departmental activities through photography.

Version 1 supports photographs only.

Video support is intentionally excluded.

---

## **Gallery Behaviour**

Images display within a responsive grid.

Selecting an image opens a lightbox viewer.

The gallery remains independent of club operations.

---

# **14\. Contact**

The Contact section displays:

* Department Address  
* Official Email

Interactive maps and contact forms are intentionally excluded.

---

# **15\. Footer**

The footer includes:

* Copyright  
* Privacy Policy

The footer intentionally excludes:

* University links  
* Social media links

---

# **16\. Authentication Boundary**

The Landing Portal does not support authentication.

Every authenticated workflow begins only after selecting:

**DOC Portal Login**

Authentication is handled entirely by the DOC Unified Digital Platform.

---

# **17\. Search**

Version 1 does not include a public search capability.

Content volume is intentionally small enough to support direct navigation.

---

# **18\. Announcements**

The Landing Portal does not display announcements.

Announcements remain within authenticated modules where appropriate.

---

# **19\. Events**

The Landing Portal does not display events.

Event discovery and participation remain within authenticated modules.

---

# **20\. Faculty Information**

The Landing Portal intentionally excludes a faculty directory.

Faculty information remains available only within authenticated workspaces where appropriate.

---

# **21\. Downloads**

Version 1 supports downloading:

* Course Brochures  
* Department Annual Reports

Other downloadable resources are intentionally excluded.

---

# **22\. Branding**

The Landing Portal uses the same design language as the authenticated platform.

Shared elements include:

* Color palette  
* Typography  
* Components  
* Iconography  
* Animation language  
* Responsive behaviour

This ensures a consistent transition between the public website and authenticated ERP.

---

# **23\. Accessibility**

Version 1 targets WCAG AA compliance.

The interface shall support:

* Keyboard navigation  
* High contrast  
* Responsive layouts  
* Screen reader compatibility  
* Clear focus indicators  
* Accessible touch targets

---

# **24\. Performance**

The Landing Portal shall prioritize:

* Extremely fast loading  
* Optimized images  
* Lazy loading  
* Minimal JavaScript  
* Excellent mobile performance

As an informational website, performance takes precedence over advanced interactions.

---

# **25\. Security**

Since the Landing Portal stores no operational information:

* Authentication is not required.  
* No public forms exist.  
* No public uploads exist.  
* No operational APIs are exposed.

Security focuses primarily on protecting shared content delivery.

---

# **26\. Responsive Behaviour**

The Landing Portal follows a mobile-first approach.

Layouts shall adapt seamlessly across:

* Mobile Phones  
* Tablets  
* Laptops  
* Desktop Displays

Navigation patterns remain consistent across devices.

---

# **27\. Content Ownership**

The Landing Portal owns no business data.

Public content originates from shared platform services.

Examples:

* Courses → Department Information  
* Clubs → Clubs Management Portal  
* Gallery → Shared Media Library  
* Statistics → Platform Configuration

The Landing Portal simply renders approved content.

---

# **28\. Shared Content Engine**

The Landing Portal consumes the Shared Content Engine.

The Content Engine provides:

* Public Department Information  
* Public Course Information  
* Club Showcase Data  
* Gallery Assets  
* Public Statistics

The Landing Portal remains a consumer rather than a content management system.

---

# **29\. Business Rules**

The Landing Portal shall:

* Never expose authenticated functionality.  
* Never display operational workflows.  
* Never duplicate information owned by other modules.  
* Never require user accounts.  
* Never become a content management platform.

The portal exists solely as a presentation layer.

---

# **30\. Screen Inventory**

Version 1 includes:

* Homepage  
* About  
* Courses  
* Course Details  
* Clubs  
* Gallery  
* Contact

No additional operational screens are required.

---

# **31\. Non-Functional Requirements**

The application shall:

* Be mobile-first.  
* Follow SPA-style navigation where appropriate.  
* Maintain premium visual quality.  
* Minimize maintenance effort.  
* Support future content expansion.  
* Share the platform's design system.

---

# **32\. Acceptance Criteria**

The Landing Portal shall successfully:

* Introduce the Department.  
* Present courses.  
* Showcase clubs.  
* Display departmental statistics.  
* Provide department contact details.  
* Showcase gallery images.  
* Redirect users to the ERP login.

while intentionally excluding all operational functionality.

---

# **33\. Version 1 Deliverables**

Version 1 includes:

* Public Homepage  
* About Section  
* Department Statistics  
* Course Catalogue  
* Course Detail Pages  
* Clubs Showcase  
* Gallery  
* Contact Information  
* ERP Login Redirect  
* Shared Design System  
* Shared Content Engine Integration

---

# **34\. Future Roadmap**

The architecture remains prepared for future additions including:

* Interactive campus map  
* Student success stories  
* Alumni showcase  
* Industry partnerships  
* Research highlights  
* Placement highlights  
* Virtual campus tour  
* Multi-language support

These additions should continue following the informational-only philosophy.

---

# **35\. Conclusion**

The Public Landing Portal serves as the public face of the DOC Unified Digital Platform.

Unlike the authenticated modules that manage operational workflows, the Landing Portal exists solely to introduce the Department of Commerce, present curated public information and guide users toward the ERP.

Its intentionally limited scope, minimal maintenance requirements and shared-content architecture ensure that it remains fast, elegant and sustainable while preserving clear ownership boundaries across the platform.

The Landing Portal completes the four-module ecosystem of the DOC Unified Digital Platform by acting as its public entry point without duplicating functionality or introducing unnecessary operational complexity.

