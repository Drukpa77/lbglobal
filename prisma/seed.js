/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient, Role } = require("@prisma/client");
const { hash } = require("bcryptjs");

const prisma = new PrismaClient();
const prioritizedCountries = [
  "Bhutan",
  "Afghanistan",
  "Albania",
  "Algeria",
  "Andorra",
  "Angola",
  "Antigua and Barbuda",
  "Argentina",
  "Armenia",
  "Australia",
  "Austria",
  "Azerbaijan",
  "Bahamas",
  "Bahrain",
  "Bangladesh",
  "Barbados",
  "Belarus",
  "Belgium",
  "Belize",
  "Benin",
  "Bolivia",
  "Bosnia and Herzegovina",
  "Botswana",
  "Brazil",
  "Brunei",
  "Bulgaria",
  "Burkina Faso",
  "Burundi",
  "Cabo Verde",
  "Cambodia",
  "Cameroon",
  "Canada",
  "Central African Republic",
  "Chad",
  "Chile",
  "China",
  "Colombia",
  "Comoros",
  "Congo",
  "Costa Rica",
  "Cote d'Ivoire",
  "Croatia",
  "Cuba",
  "Cyprus",
  "Czechia",
  "Democratic Republic of the Congo",
  "Denmark",
  "Djibouti",
  "Dominica",
  "Dominican Republic",
  "Ecuador",
  "Egypt",
  "El Salvador",
  "Equatorial Guinea",
  "Eritrea",
  "Estonia",
  "Eswatini",
  "Ethiopia",
  "Fiji",
  "Finland",
  "France",
  "Gabon",
  "Gambia",
  "Georgia",
  "Germany",
  "Ghana",
  "Greece",
  "Grenada",
  "Guatemala",
  "Guinea",
  "Guinea-Bissau",
  "Guyana",
  "Haiti",
  "Honduras",
  "Hungary",
  "Iceland",
  "India",
  "Indonesia",
  "Iran",
  "Iraq",
  "Ireland",
  "Israel",
  "Italy",
  "Jamaica",
  "Japan",
  "Jordan",
  "Kazakhstan",
  "Kenya",
  "Kiribati",
  "Kuwait",
  "Kyrgyzstan",
  "Laos",
  "Latvia",
  "Lebanon",
  "Lesotho",
  "Liberia",
  "Libya",
  "Liechtenstein",
  "Lithuania",
  "Luxembourg",
  "Madagascar",
  "Malawi",
  "Malaysia",
  "Maldives",
  "Mali",
  "Malta",
  "Marshall Islands",
  "Mauritania",
  "Mauritius",
  "Mexico",
  "Micronesia",
  "Moldova",
  "Monaco",
  "Mongolia",
  "Montenegro",
  "Morocco",
  "Mozambique",
  "Myanmar",
  "Namibia",
  "Nauru",
  "Nepal",
  "Netherlands",
  "New Zealand",
  "Nicaragua",
  "Niger",
  "Nigeria",
  "North Korea",
  "North Macedonia",
  "Norway",
  "Oman",
  "Pakistan",
  "Palau",
  "Palestine",
  "Panama",
  "Papua New Guinea",
  "Paraguay",
  "Peru",
  "Philippines",
  "Poland",
  "Portugal",
  "Qatar",
  "Romania",
  "Russia",
  "Rwanda",
  "Saint Kitts and Nevis",
  "Saint Lucia",
  "Saint Vincent and the Grenadines",
  "Samoa",
  "San Marino",
  "Sao Tome and Principe",
  "Saudi Arabia",
  "Senegal",
  "Serbia",
  "Seychelles",
  "Sierra Leone",
  "Singapore",
  "Slovakia",
  "Slovenia",
  "Solomon Islands",
  "Somalia",
  "South Africa",
  "South Korea",
  "South Sudan",
  "Spain",
  "Sri Lanka",
  "Sudan",
  "Suriname",
  "Sweden",
  "Switzerland",
  "Syria",
  "Taiwan",
  "Tajikistan",
  "Tanzania",
  "Thailand",
  "Timor-Leste",
  "Togo",
  "Tonga",
  "Trinidad and Tobago",
  "Tunisia",
  "Turkey",
  "Turkmenistan",
  "Tuvalu",
  "Uganda",
  "Ukraine",
  "United Arab Emirates",
  "United Kingdom",
  "United States",
  "Uruguay",
  "Uzbekistan",
  "Vanuatu",
  "Vatican City",
  "Venezuela",
  "Vietnam",
  "Yemen",
  "Zambia",
  "Zimbabwe",
];

async function upsertUser({ name, email, password, role }) {
  const passwordHash = await hash(password, 12);

  return prisma.user.upsert({
    where: { email },
    update: { name, password: passwordHash, role },
    create: { name, email, password: passwordHash, role },
  });
}

async function main() {
  const admin = await upsertUser({
    name: "Admin User",
    email: "admin@lbglobal.test",
    password: "AdminPass123!",
    role: Role.ADMIN,
  });

  const subAdmin = await upsertUser({
    name: "Sub Admin User",
    email: "agent@lbglobal.test",
    password: "AgentPass123!",
    role: Role.SUB_ADMIN,
  });

  const internalStaff = await upsertUser({
    name: "Internal Staff User",
    email: "staff@lbglobal.test",
    password: "StaffPass123!",
    role: Role.INTERNAL_STAFF,
  });

  const student = await upsertUser({
    name: "Student User",
    email: "student@lbglobal.test",
    password: "StudentPass123!",
    role: Role.USER,
  });

  const questionTemplateTitle = "Australia Student Application Questionnaire";
  const existingTemplate = await prisma.questionnaireTemplate.findFirst({
    where: { title: questionTemplateTitle },
    select: { id: true },
  });

  const questions = [
    {
      id: "fullName",
      label: "Full name",
      type: "text",
      required: true,
      placeholder: "Enter your full name",
    },
    {
      id: "email",
      label: "Email",
      type: "text",
      required: true,
      placeholder: "you@example.com",
    },
    {
      id: "phone",
      label: "Phone number",
      type: "text",
      required: true,
      placeholder: "e.g. +977-98XXXXXXXX",
    },
    {
      id: "city",
      label: "City",
      type: "text",
      required: true,
      placeholder: "Your current city",
    },
    {
      id: "country",
      label: "Country",
      type: "select",
      required: true,
      options: prioritizedCountries,
    },
    {
      id: "currentEducationLevel",
      label: "Current education level",
      type: "select",
      required: true,
      options: ["+2 / High School", "Diploma", "Bachelors", "Masters", "Other"],
    },
    {
      id: "targetCourse",
      label: "Target course",
      type: "text",
      required: true,
      placeholder: "e.g. Master of IT",
    },
    {
      id: "preferredIntake",
      label: "Preferred intake",
      type: "select",
      required: true,
      options: ["Feb 2026", "Jul 2026", "Nov 2026", "Feb 2027"],
    },
    {
      id: "englishTestScore",
      label: "English test score (IELTS/PTE/TOEFL)",
      type: "text",
      required: false,
      placeholder: "e.g. IELTS 6.5",
    },
    {
      id: "notes",
      label: "Additional notes",
      type: "textarea",
      required: false,
      placeholder: "Any extra details",
    },
  ];

  let templateId = existingTemplate?.id;
  if (templateId) {
    await prisma.questionnaireTemplate.update({
      where: { id: templateId },
      data: {
        description: "Initial student intake questionnaire for Australia applications",
        isActive: true,
        questions,
      },
    });
  } else {
    const createdTemplate = await prisma.questionnaireTemplate.create({
      data: {
        title: questionTemplateTitle,
        description: "Initial student intake questionnaire for Australia applications",
        isActive: true,
        questions,
      },
    });
    templateId = createdTemplate.id;
  }

  const existingSubmission = await prisma.questionnaireSubmission.findFirst({
    where: { studentId: student.id, templateId },
    select: { id: true },
  });

  if (!existingSubmission) {
    await prisma.studentProfile.upsert({
      where: { userId: student.id },
      update: {
        city: "Kathmandu",
        nationality: "Nepal",
        phone: "+977-98XXXXXXXX",
        currentEducationLevel: "Bachelors",
        targetCourse: "Master of IT",
        preferredIntake: "Jul 2026",
        englishTestScore: "IELTS 6.5",
        visaStatus: "APPLIED",
        courseStartDate: new Date("2026-07-15"),
        courseEndDate: new Date("2028-07-15"),
        visaExpiryDate: new Date("2028-08-01"),
        lastFollowUpDate: new Date(),
        nextFollowUpDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        followUpNotes: "Follow up after GTE response and financial docs update.",
      },
      create: {
        userId: student.id,
        city: "Kathmandu",
        nationality: "Nepal",
        phone: "+977-98XXXXXXXX",
        currentEducationLevel: "Bachelors",
        targetCourse: "Master of IT",
        preferredIntake: "Jul 2026",
        englishTestScore: "IELTS 6.5",
        visaStatus: "APPLIED",
        courseStartDate: new Date("2026-07-15"),
        courseEndDate: new Date("2028-07-15"),
        visaExpiryDate: new Date("2028-08-01"),
        lastFollowUpDate: new Date(),
        nextFollowUpDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14),
        followUpNotes: "Follow up after GTE response and financial docs update.",
      },
    });

    await prisma.questionnaireSubmission.create({
      data: {
        studentId: student.id,
        templateId,
        assignedToId: subAdmin.id,
        sourceCity: "Kathmandu",
        sourceCountry: "Nepal",
        intendedCourse: "Master of IT",
        intendedIntake: "Jul 2026",
        answers: {
          fullName: "Student User",
          phone: "+977-98XXXXXXXX",
          city: "Kathmandu",
          country: "Nepal",
          currentEducationLevel: "Bachelors",
          targetCourse: "Master of IT",
          preferredIntake: "Jul 2026",
          englishTestScore: "IELTS 6.5",
          notes: "Interested in scholarship options.",
        },
      },
    });
  }

  await prisma.questionnaireSubmission.updateMany({
    where: {
      studentId: student.id,
      assignedToId: null,
    },
    data: {
      assignedToId: subAdmin.id,
    },
  });

  await prisma.user.update({
    where: { id: admin.id },
    data: { name: "Admin User" },
  });

  await prisma.staffTeamMembership.upsert({
    where: {
      managerId_internalStaffId: {
        managerId: subAdmin.id,
        internalStaffId: internalStaff.id,
      },
    },
    update: {},
    create: {
      managerId: subAdmin.id,
      internalStaffId: internalStaff.id,
    },
  });

  const defaultTemplates = [
    {
      key: "contract_default",
      name: "Default Contract Template",
      type: "CONTRACT",
      subject: "Study Consultancy Contract - {{studentName}}",
      htmlBody:
        "<h2>Consultancy Contract</h2><p>Hello {{studentName}},</p><p>Please review your contract details for {{targetCourse}}.</p><p>Regards,<br/>{{senderName}}</p>",
      placeholders: ["studentName", "targetCourse", "senderName"],
    },
    {
      key: "invoice_default",
      name: "Default Invoice Template",
      type: "INVOICE",
      subject: "Invoice - {{invoiceNumber}} - {{studentName}}",
      htmlBody:
        "<h2>Invoice {{invoiceNumber}}</h2><p>Dear {{studentName}},</p><p>Total amount due: {{currency}} {{totalAmount}}</p><p>Due date: {{dueDate}}</p>",
      placeholders: ["invoiceNumber", "studentName", "currency", "totalAmount", "dueDate"],
    },
    {
      key: "followup_default",
      name: "Default Follow-up Template",
      type: "FOLLOW_UP",
      subject: "Follow-up on your study application - {{studentName}}",
      htmlBody:
        "<p>Hello {{studentName}},</p><p>Just checking in regarding your application progress. Please reply if you need help.</p><p>Regards,<br/>{{senderName}}</p>",
      placeholders: ["studentName", "senderName"],
    },
  ];

  for (const template of defaultTemplates) {
    await prisma.emailTemplate.upsert({
      where: { key: template.key },
      update: {
        name: template.name,
        type: template.type,
        subject: template.subject,
        htmlBody: template.htmlBody,
        placeholders: template.placeholders,
        isActive: true,
        createdById: admin.id,
      },
      create: {
        key: template.key,
        name: template.name,
        type: template.type,
        subject: template.subject,
        htmlBody: template.htmlBody,
        placeholders: template.placeholders,
        isActive: true,
        createdById: admin.id,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
