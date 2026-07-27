export const DESIGNATION_OPTIONS = [
  'Software Developer',
  'Frontend Developer',
  'Backend Developer',
  'Full Stack Developer',
  'Mobile App Developer',
  'UI/UX Designer',
  'Graphic Designer',
  'QA Engineer',
  'DevOps Engineer',
  'Project Coordinator',
  'Business Analyst',
  'Sales Executive',
  'Marketing Executive',
  'Customer Support Executive',
  'HR Executive',
  'HR Manager',
  'Recruiter',
  'Talent Acquisition Specialist',
  'Accountant',
  'Finance Executive',
  'Finance Manager',
  'Operations Executive',
  'Operations Manager',
  'Data Analyst',
  'Product Manager',
  'Project Manager',
  'Scrum Master',
  'Team Lead',
  'Technical Lead',
  'SEO Specialist',
  'Social Media Manager',
  'Digital Marketing Specialist',
  'Business Development Executive',
  'Customer Success Executive',
  'Support Engineer',
  'Office Administrator',
  'Content Writer',
  'Intern',
]

export const getDesignationOptions = (customDesignations = [], currentDesignation = '') => {
  const combined = [...customDesignations, ...DESIGNATION_OPTIONS]
  const cleanCurrent = currentDesignation.trim()
  if (cleanCurrent && !combined.includes(cleanCurrent)) combined.unshift(cleanCurrent)
  return Array.from(new Set(combined)).sort((a, b) => a.localeCompare(b))
}
