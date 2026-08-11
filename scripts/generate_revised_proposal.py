from pathlib import Path

from pypdf import PdfReader, PdfWriter
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.lib.utils import simpleSplit


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output/pdf/PayNear_Project_Proposal_Updated_Wireframes.pdf"
TEMP = ROOT / "tmp/pdfs/proposal-revision/revised-text.pdf"
OVERLAY = ROOT / "tmp/pdfs/proposal-revision/page-overlay.pdf"
OUTPUT = ROOT / "output/pdf/PayNear_Project_Proposal_Revised_Owner_Workflow.pdf"

INK = HexColor("#17324D")
MUTED = HexColor("#617486")
TEAL = HexColor("#007C78")
TEAL_DARK = HexColor("#005F5B")
MINT = HexColor("#DFF4F1")
PALE = HexColor("#F5FBFA")
LINE = HexColor("#C9E0DE")
ORANGE_PALE = HexColor("#FFF0E3")
DANGER_PALE = HexColor("#FFE1E3")
WIDTH, HEIGHT = letter


def footer(c, page_number):
    c.setStrokeColor(LINE)
    c.line(54, 38, WIDTH - 54, 38)
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(54, 24, "PayNear Project Proposal - Revised Owner Workflow")
    c.drawRightString(WIDTH - 54, 24, f"Page {page_number}")


def page_header(c, title, subtitle=None):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 19)
    c.drawString(54, HEIGHT - 62, title)
    if subtitle:
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 9)
        c.drawString(54, HEIGHT - 79, subtitle)
    c.setStrokeColor(LINE)
    c.line(54, HEIGHT - 90, WIDTH - 54, HEIGHT - 90)
    return HEIGHT - 116


def wrapped(c, text, x, y, width, size=9.6, leading=13, color=INK, font="Helvetica"):
    c.setFillColor(color)
    c.setFont(font, size)
    lines = simpleSplit(text, font, size, width)
    for line in lines:
        c.drawString(x, y, line)
        y -= leading
    return y


def heading(c, text, y, size=15):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", size)
    c.drawString(54, y, text)
    return y - size - 8


def bullet(c, text, y, indent=66, size=9.4, leading=12.5, color=INK):
    c.setFillColor(TEAL)
    c.circle(indent - 7, y + 3, 1.5, fill=1, stroke=0)
    return wrapped(c, text, indent, y, WIDTH - indent - 54, size, leading, color)


def story(c, code, title, user_story, criteria, y):
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 11.5)
    c.drawString(54, y, f"{code}: {title}")
    y -= 17
    y = wrapped(c, f"User story: {user_story}", 66, y, WIDTH - 120, 9.1, 12, INK)
    y -= 3
    for item in criteria:
        y = bullet(c, item, y, 76, 8.9, 11.5, MUTED)
    return y - 12


def draw_page_1(c):
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(WIDTH / 2, HEIGHT - 65, "PayNear")
    c.setFillColor(INK)
    c.setFont("Helvetica", 14)
    c.drawCentredString(WIDTH / 2, HEIGHT - 88, "MERN Full-Stack Project Proposal")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 9)
    c.drawCentredString(WIDTH / 2, HEIGHT - 106, "Revised August 2026 - Owner Submission and Admin Publication Workflow")
    y = HEIGHT - 145
    y = heading(c, "1. Project Summary", y)
    y = wrapped(c, "PayNear is a location-based web application that helps consumers discover nearby establishments based on accepted payment methods. Business owners can submit their store information and storefront image, while authorized PayNear administrators verify the information before it becomes publicly searchable.", 54, y, WIDTH - 108)
    y -= 14
    y = heading(c, "2. Problem Statement", y)
    y = wrapped(c, "Consumers often learn only at checkout that a store does not accept their preferred payment method. Directory data can also be incomplete or outdated. PayNear addresses both problems through owner-submitted information and a controlled administrator verification process.", 54, y, WIDTH - 108)
    y -= 14
    y = heading(c, "3. Proposed Solution", y)
    y = wrapped(c, "The public application provides verified search results, map-based discovery, payment filters, and store details. A separate owner area accepts private submissions. A protected administrator dashboard reviews each submission and controls whether the listing is published, returned for changes, rejected, or deactivated.", 54, y, WIDTH - 108)
    y -= 14
    y = heading(c, "4. Project Objectives", y)
    for item in [
        "Help users find nearby verified establishments that accept a selected payment method.",
        "Give legitimate business owners a structured way to submit and maintain store information.",
        "Give administrators controlled moderation tools without requiring direct database access.",
        "Prevent pending, rejected, or inactive listings from appearing in public search results.",
    ]:
        y = bullet(c, item, y)
    y -= 9
    y = heading(c, "5. Target Users", y)
    for item in [
        "Consumers, travelers, and commuters who need payment-compatible establishments nearby.",
        "Business owners who submit store details, location, accepted payment methods, and an image.",
        "PayNear administrators, initially the project developers, who verify and publish listings.",
    ]:
        y = bullet(c, item, y)
    footer(c, 1)


def draw_page_2(c):
    y = page_header(c, "6. MVP Features", "Priority reflects the revised owner-to-admin publication workflow.")
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(54, y, "High Priority")
    y -= 18
    high = [
        "Role-based account access for consumers, business owners, and administrators.",
        "Consent-based location detection with manual coordinates as a fallback.",
        "Nearby search by radius, category, payment method, open status, and rating.",
        "Private owner submission of store name, category, address, coordinates, payment methods, and storefront image.",
        "Protected administrator queue with verify and publish, request changes, reject, edit, and deactivate actions.",
        "Public APIs that return only listings whose status is verified and active.",
        "Persistent MongoDB storage for accounts, moderation audit fields, images, and messages.",
    ]
    for item in high:
        y = bullet(c, item, y)
    y -= 7
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(54, y, "Medium Priority")
    y -= 18
    for item in [
        "Favorites and a preferred payment method for authenticated consumers.",
        "Reviews and ratings that users can edit or remove only for their own account.",
        "Stable public links to verified establishment details.",
        "Real-time Socket.IO chat between a consumer and the verified establishment owner.",
    ]:
        y = bullet(c, item, y)
    y -= 10
    y = heading(c, "7. Out of Scope for the Initial MVP", y)
    for item in [
        "Payment processing or storage of card, bank, or e-wallet credentials.",
        "Automatic document authenticity decisions; administrators make the final verification decision.",
        "Turn-by-turn navigation, live traffic routing, and native Android or iOS applications.",
        "Automatic publication of any owner-submitted listing without administrator approval.",
    ]:
        y = bullet(c, item, y)
    y -= 12
    c.setFillColor(ORANGE_PALE)
    c.roundRect(54, y - 62, WIDTH - 108, 62, 8, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(68, y - 19, "Scope clarification")
    wrapped(c, "Business-owner self-registration and store submission are now in scope. Automated verification remains out of scope: every listing must be reviewed by an authorized PayNear administrator.", 68, y - 36, WIDTH - 136, 8.7, 11, MUTED)
    footer(c, 2)


def draw_page_3(c):
    y = page_header(c, "8. High-Priority User Stories and Acceptance Criteria")
    y = story(c, "US-01", "Account Access", "As a consumer or business owner, I want to register and sign in so that I can securely use role-specific features.", [
        "Registration validates required fields and prevents duplicate email addresses.",
        "Public registration can create consumer or owner accounts, but never an administrator.",
        "Protected routes reject missing, invalid, or expired sessions.",
    ], y)
    y = story(c, "US-02", "Location Permission", "As a consumer, I want to control access to my location so that nearby results are useful without sacrificing consent.", [
        "The browser asks permission before location detection begins.",
        "Approved access provides usable coordinates for the current search.",
        "Denied or unavailable access preserves manual search and provides a helpful message.",
    ], y)
    y = story(c, "US-03", "Search and Filter", "As a consumer, I want to filter nearby establishments by payment method and radius so that I only see relevant options.", [
        "Search supports category, payment method, radius, open status, and rating filters.",
        "Results within a location-based search fall inside the selected radius.",
        "Loading, empty, and error states are visible and understandable.",
    ], y)
    footer(c, 3)


def draw_page_4(c):
    y = page_header(c, "8. High-Priority User Stories (Continued)")
    y = story(c, "US-04", "Best-Match Results", "As a consumer, I want suitable establishments ranked for me so that I can choose quickly.", [
        "Each result shows name, distance, address, status, image, and accepted payment methods.",
        "Only verified and active listings can appear as public results.",
        "Default ordering prioritizes distance and relevance.",
    ], y)
    y = story(c, "US-05", "Owner Store Submission", "As a business owner, I want to submit my store details and image so that PayNear administrators can review my business for publication.", [
        "The owner provides name, category, complete address, coordinates, payment methods, and a valid image.",
        "A new submission begins as pending and is not publicly discoverable.",
        "The owner can view only their own private submissions and review notes.",
        "Sensitive edits to a verified listing return it to pending review.",
    ], y)
    y = story(c, "US-06", "Owner Image and Status Management", "As a business owner, I want to replace my storefront image and update operating status so that my listing stays useful.", [
        "Image uploads accept JPG, PNG, or WebP files no larger than 3 MB.",
        "A replacement image requires another administrator review before publication.",
        "A verified owner can update open or closed status without changing administrator-only fields.",
    ], y)
    footer(c, 4)


def draw_page_5(c):
    y = page_header(c, "9. Administration and Supporting User Stories")
    y = story(c, "US-07", "Admin Verification and Publication", "As an administrator, I want to review owner submissions so that only trustworthy listings become public.", [
        "Only authorized administrators can load the moderation queue or perform review actions.",
        "The administrator can verify and publish, request changes, reject, edit, or deactivate a listing.",
        "Verification requires a storefront image and records reviewer, review time, notes, and publication time.",
        "Review decisions notify the submitting owner.",
    ], y)
    y = story(c, "US-08", "Favorites and Payment Preference", "As a consumer, I want to save places and a preferred payment method so that repeat searches are faster.", [
        "Favorites contain no duplicates and persist across authenticated sessions.",
        "The saved payment preference can be changed from the account experience.",
    ], y)
    y = story(c, "US-09", "Reviews and Shareable Details", "As a consumer, I want to review and share a verified establishment so that other people can make informed choices.", [
        "A user can modify only their own review, and aggregate rating updates are displayed.",
        "A public link opens verified establishment details without exposing private account or user-location data.",
    ], y)
    footer(c, 5)


def draw_page_6(c):
    y = page_header(c, "10. Definition of MVP Complete")
    for item in [
        "All high-priority acceptance criteria pass functional tests.",
        "The consumer, owner, and administrator journeys work on mobile and desktop layouts.",
        "Role-based authorization protects ownership and administrator-only actions on the server.",
        "The deployed API connects securely to MongoDB and does not use the in-memory demo store.",
        "Uploaded listing images survive service restarts and redeployments.",
        "Pending, rejected, changes-requested, and inactive listings cannot appear in public results.",
    ]:
        y = bullet(c, item, y)
    y -= 12
    y = heading(c, "11. Technical Approach", y)
    sections = [
        ("Frontend", "React and Vite provide responsive consumer discovery, owner submission, and protected administrator moderation screens."),
        ("Backend", "Node.js and Express provide REST endpoints, validation, JWT authentication, ownership checks, moderation rules, and Socket.IO chat."),
        ("Database", "MongoDB and Mongoose persist users, establishments, GeoJSON coordinates, moderation audit fields, images, messages, and notifications."),
        ("Deployment", "Vercel hosts the React client. Render hosts the Express and Socket.IO service. MongoDB Atlas supplies production persistence."),
    ]
    for name, description in sections:
        c.setFillColor(TEAL_DARK)
        c.setFont("Helvetica-Bold", 10)
        c.drawString(54, y, name)
        y = wrapped(c, description, 126, y, WIDTH - 180, 8.9, 11.5, MUTED)
        y -= 6
    y -= 3
    y = heading(c, "12. Quality and Security Requirements", y)
    for item in [
        "Server-side validation, hashed passwords, least-privilege authorization, and no public admin registration.",
        "Consent-based location use, sanitized inputs, image type and size limits, and protected moderation endpoints.",
        "Indexed geospatial queries, explicit loading and error states, and automated regression tests for publication rules.",
    ]:
        y = bullet(c, item, y, size=8.9, leading=11.5)
    footer(c, 6)


def workflow_box(c, x, y, width, title, detail, fill):
    c.setFillColor(fill)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, width, 74, 10, fill=1, stroke=1)
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + 12, y + 49, title)
    wrapped(c, detail, x + 12, y + 33, width - 24, 7.8, 10, MUTED)


def draw_page_7(c):
    y = page_header(c, "13. Development Plan and Publication Workflow")
    phases = [
        "Phase 1 - Foundation: schemas, environment configuration, API conventions, and production database.",
        "Phase 2 - Access: registration, sign-in, session handling, owner authorization, and seeded administrator account.",
        "Phase 3 - Owner submission: store details, coordinates, payment methods, image persistence, and private listing status.",
        "Phase 4 - Administration: moderation queue, audit fields, review notes, verification, rejection, and publication.",
        "Phase 5 - Consumer discovery: verified-only search, map results, favorites, preferences, reviews, and sharing.",
        "Phase 6 - Release: responsive testing, security checks, production configuration, and deployment verification.",
    ]
    for item in phases:
        y = bullet(c, item, y, size=8.8, leading=11.3)
    y -= 10
    y = heading(c, "Listing State Lifecycle", y, 13)
    box_y = y - 86
    box_w = 145
    workflow_box(c, 54, box_y, box_w, "1. Owner submits", "Private status: pending", PALE)
    workflow_box(c, 233, box_y, box_w, "2. Admin reviews", "Verify, request changes, or reject", ORANGE_PALE)
    workflow_box(c, 412, box_y, box_w, "3. Public listing", "Visible only when verified and active", MINT)
    c.setStrokeColor(TEAL)
    c.setLineWidth(1.5)
    c.line(202, box_y + 37, 226, box_y + 37)
    c.line(381, box_y + 37, 405, box_y + 37)
    c.setFillColor(TEAL)
    for arrow_x in [226, 405]:
        c.line(arrow_x - 5, box_y + 41, arrow_x, box_y + 37)
        c.line(arrow_x - 5, box_y + 33, arrow_x, box_y + 37)
    y = box_y - 28
    y = heading(c, "14. Success Measures", y, 13)
    for item in [
        "Only verified and active establishments appear in public search and map results.",
        "Owners can submit and track stores without seeing or changing another owner's data.",
        "Administrators can moderate listings without direct database access.",
        "Publication decisions and owner-sensitive edits are traceable through audit fields and automated tests.",
    ]:
        y = bullet(c, item, y, size=8.7, leading=11)
    y -= 7
    y = heading(c, "15. Requested Decision", y, 13)
    wrapped(c, "Approve PayNear as a MERN full-stack project with consumer, business-owner, and administrator roles, using the owner submission and administrator verification workflow as a required part of the MVP.", 54, y, WIDTH - 108, 9, 12, INK)
    footer(c, 7)


def draw_owner_wireframe(c):
    y = page_header(c, "16. Updated Wireframes - Owner Submission", "WF-OWNER-01: private store submission and administrator handoff")
    c.setFillColor(PALE)
    c.setStrokeColor(LINE)
    c.roundRect(54, 238, 228, 420, 14, fill=1, stroke=1)
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(72, 625, "My business")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(72, 608, "Submit a store for PayNear verification")
    fields = ["Store name", "Category", "Complete address", "Latitude / longitude", "Payment methods"]
    field_y = 574
    for label in fields:
        c.setFillColor(MUTED)
        c.setFont("Helvetica-Bold", 7.5)
        c.drawString(72, field_y + 29, label)
        c.setFillColor(white)
        c.setStrokeColor(LINE)
        c.roundRect(72, field_y, 192, 24, 5, fill=1, stroke=1)
        field_y -= 53
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.roundRect(72, 281, 192, 72, 6, fill=1, stroke=1)
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 8)
    c.drawCentredString(168, 314, "UPLOAD STOREFRONT IMAGE")
    c.setFillColor(TEAL)
    c.roundRect(72, 252, 192, 25, 6, fill=1, stroke=0)
    c.setFillColor(white)
    c.drawCentredString(168, 261, "SUBMIT FOR REVIEW")

    c.setFillColor(ORANGE_PALE)
    c.setStrokeColor(LINE)
    c.roundRect(320, 438, 238, 220, 14, fill=1, stroke=1)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(338, 624, "Admin review queue")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 8)
    c.drawString(338, 607, "Pending submissions are private")
    c.setFillColor(white)
    c.roundRect(338, 490, 202, 96, 8, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(352, 560, "Maribago Daily Mart")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(352, 543, "Image, address, coordinates, payments")
    c.setFillColor(TEAL)
    c.roundRect(352, 506, 74, 23, 5, fill=1, stroke=0)
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 7.5)
    c.drawCentredString(389, 514, "VERIFY")
    c.setFillColor(white)
    c.setStrokeColor(LINE)
    c.roundRect(434, 506, 92, 23, 5, fill=1, stroke=1)
    c.setFillColor(TEAL_DARK)
    c.drawCentredString(480, 514, "REQUEST CHANGES")
    wrapped(c, "A verification decision records the administrator, review time, notes, and publication time.", 338, 467, 202, 8, 10.5, MUTED)

    c.setFillColor(MINT)
    c.setStrokeColor(LINE)
    c.roundRect(320, 238, 238, 166, 14, fill=1, stroke=1)
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(338, 370, "Public PayNear")
    c.setFillColor(white)
    c.roundRect(338, 275, 202, 75, 8, fill=1, stroke=0)
    c.setFillColor(TEAL_DARK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(352, 326, "Verified store result")
    c.setFillColor(MUTED)
    c.setFont("Helvetica", 7.5)
    c.drawString(352, 309, "Visible in search, map, and public details")
    c.setFillColor(TEAL)
    c.setFont("Helvetica-Bold", 8)
    c.drawString(352, 288, "VERIFIED + ACTIVE ONLY")

    c.setStrokeColor(TEAL)
    c.setLineWidth(2)
    c.line(287, 540, 313, 540)
    c.line(439, 429, 439, 411)
    c.setFillColor(TEAL)
    c.line(308, 545, 313, 540)
    c.line(308, 535, 313, 540)
    c.line(434, 416, 439, 411)
    c.line(444, 416, 439, 411)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(54, 198, "Interaction sequence")
    wrapped(c, "1. Owner registers and submits complete store evidence.  2. The listing remains private while administrators review it.  3. Verification publishes it to consumers.  4. Rejected or changes-requested submissions remain private and return to the owner with notes.", 54, 178, WIDTH - 108, 8.6, 12, MUTED)
    footer(c, 8)


def generate_text_pdf():
    TEMP.parent.mkdir(parents=True, exist_ok=True)
    output = canvas.Canvas(str(TEMP), pagesize=letter)
    for draw_page in [draw_page_1, draw_page_2, draw_page_3, draw_page_4, draw_page_5, draw_page_6, draw_page_7, draw_owner_wireframe]:
        draw_page(output)
        output.showPage()
    output.save()


def numbered_wireframe_page(page, page_number):
    overlay = canvas.Canvas(str(OVERLAY), pagesize=letter)
    overlay.setFillColor(white)
    overlay.rect(WIDTH - 102, 12, 70, 24, fill=1, stroke=0)
    overlay.setFillColor(MUTED)
    overlay.setFont("Helvetica", 7.5)
    overlay.drawRightString(WIDTH - 54, 24, f"Page {page_number}")
    overlay.save()
    overlay_page = PdfReader(str(OVERLAY)).pages[0]
    page.merge_page(overlay_page)
    return page


def build():
    if not SOURCE.exists():
        raise FileNotFoundError(f"Source wireframe PDF not found: {SOURCE}")
    generate_text_pdf()
    writer = PdfWriter()
    for page in PdfReader(str(TEMP)).pages:
        writer.add_page(page)
    source_pages = PdfReader(str(SOURCE)).pages
    for index, source_page in enumerate(source_pages[7:10], start=9):
        writer.add_page(numbered_wireframe_page(source_page, index))
    writer.add_metadata({
        "/Title": "PayNear Project Proposal - Revised Owner Workflow",
        "/Author": "The Last Room",
        "/Subject": "MERN full-stack proposal with owner submission and administrator publication workflow",
    })
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("wb") as stream:
        writer.write(stream)
    print(OUTPUT)


if __name__ == "__main__":
    build()
