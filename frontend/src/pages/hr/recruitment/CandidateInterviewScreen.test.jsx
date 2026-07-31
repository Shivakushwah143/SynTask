import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CandidateInterviewScreen from './CandidateInterviewScreen';
import { recruitmentApi } from '../../../api/recruitment';
import { departmentsAPI } from '../../../api/departments';

// Mock the recruitment API
vi.mock('../../../api/recruitment', () => ({
  recruitmentApi: {
    getCandidates: vi.fn(),
    getInterviews: vi.fn(),
    createCandidate: vi.fn(),
    createInterview: vi.fn(),
    getJobs: vi.fn(),
    assignJobToCandidate: vi.fn(),
    createJob: vi.fn(),
  },
}));

// Mock the departments API
vi.mock('../../../api/departments', () => ({
  departmentsAPI: {
    listDepartments: vi.fn(),
  },
}));

const createTestQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
    },
  },
});

const renderWithQueryClient = (component) => {
  const testQueryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={testQueryClient}>
      {component}
    </QueryClientProvider>
  );
};

describe('CandidateInterviewScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the main header and description', () => {
    const mockCandidates = [];
    const mockInterviews = [];
    
    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    
    renderWithQueryClient(<CandidateInterviewScreen />);
    
    expect(screen.getByText('Candidate Interview Management')).toBeInTheDocument();
    expect(screen.getByText(/Select an existing candidate or add a new one/)).toBeInTheDocument();
  });

  it('shows search input and add new candidate button', () => {
    const mockCandidates = [];
    const mockInterviews = [];
    
    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    
    renderWithQueryClient(<CandidateInterviewScreen />);
    
    expect(screen.getByPlaceholderText('Search candidates by name, email, or phone...')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Add New Candidate/ }).length).toBeGreaterThan(0);
  });

  it('opens candidate popup when add new candidate button is clicked', async () => {
    const mockCandidates = [];
    const mockInterviews = [];
    
    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    
    renderWithQueryClient(<CandidateInterviewScreen />);
    
    const addButtons = screen.getAllByRole('button', { name: /Add New Candidate/ });
    fireEvent.click(addButtons[0]);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Candidate' })).toBeInTheDocument();
    });
  });

  it('displays existing candidates list', async () => {
    const mockCandidates = [
      {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+91 9876543210',
        source: 'Referral',
        currentCompany: 'Tech Corp',
      },
      {
        id: '2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+91 9876543211',
        source: 'LinkedIn',
        currentCompany: 'Startup Inc',
      }
    ];
    const mockInterviews = [];
    
    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    
    renderWithQueryClient(<CandidateInterviewScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    });
  });

  it('searches candidates when search term changes', async () => {
    const mockCandidates = [
      {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+91 9876543210',
        source: 'Referral',
        currentCompany: 'Tech Corp',
      }
    ];
    const mockInterviews = [];
    
    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    
    renderWithQueryClient(<CandidateInterviewScreen />);
    
    const searchInput = screen.getByPlaceholderText('Search candidates by name, email, or phone...');
    fireEvent.change(searchInput, { target: { value: 'John' } });
    
    await waitFor(() => {
      expect(recruitmentApi.getCandidates).toHaveBeenCalledWith({ 
        search: 'John', 
        limit: 50 
      });
    });
  });

  it('creates candidate when form is submitted', async () => {
    const mockCandidates = [];
    const mockInterviews = [];
    
    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    recruitmentApi.createCandidate.mockResolvedValue({ data: { id: 'new_candidate' } });
    
    renderWithQueryClient(<CandidateInterviewScreen />);
    
    // Open candidate popup
    const addButton = screen.getAllByRole('button', { name: /Add New Candidate/ })[0];
    fireEvent.click(addButton);
    
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save Candidate' })).toBeInTheDocument();
    });
    
    // Fill out the form
    const nameInput = screen.getByPlaceholderText('John Doe');
    const emailInput = screen.getByPlaceholderText('john@example.com');
    const sourceSelect = screen.getByRole('combobox');
    
    fireEvent.change(nameInput, { target: { value: 'New Candidate' } });
    fireEvent.change(emailInput, { target: { value: 'new@example.com' } });
    fireEvent.change(sourceSelect, { target: { value: 'Career Page' } });
    
    // Submit the form
    const saveButton = screen.getByRole('button', { name: 'Save Candidate' });
    fireEvent.click(saveButton);
    
    await waitFor(() => {
      expect(recruitmentApi.createCandidate).toHaveBeenCalled();
    });
  });

  it('displays candidate source badges correctly', async () => {
    const mockCandidates = [
      {
        id: '1',
        name: 'John Doe',
        email: 'john@example.com',
        phone: '+91 9876543210',
        source: 'Referral',
        currentCompany: 'Tech Corp',
      },
      {
        id: '2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        phone: '+91 9876543211',
        source: 'LinkedIn',
        currentCompany: 'Startup Inc',
      }
    ];
    const mockInterviews = [];
    
    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    
    renderWithQueryClient(<CandidateInterviewScreen />);
    
    await waitFor(() => {
      expect(screen.getByText('Referral')).toBeInTheDocument();
      expect(screen.getByText('LinkedIn')).toBeInTheDocument();
    });
  });

  it('opens assign job popup and assigns a job to the candidate', async () => {
    const mockCandidates = [
      {
        id: '1',
        full_name: 'John Doe',
        email: 'john@example.com',
        source: 'Referral',
      }
    ];
    const mockJobs = [
      { id: 'job-1', title: 'Frontend Engineer', location: 'Remote' },
      { id: 'job-2', title: 'Backend Engineer', location: 'Bangalore' },
    ];
    const mockInterviews = [];

    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    recruitmentApi.getJobs.mockResolvedValue({ data: { items: mockJobs } });
    recruitmentApi.assignJobToCandidate.mockResolvedValue({
      data: { application_id: 'app-1', job_title: 'Frontend Engineer', message: 'assigned' }
    });

    renderWithQueryClient(<CandidateInterviewScreen />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    // Click "Assign Job" on the candidate card
    fireEvent.click(screen.getAllByRole('button', { name: /Assign Job/ })[0]);

    await waitFor(() => {
      expect(screen.getByText('Select Job *')).toBeInTheDocument();
    });

    // Select a job from the dropdown (the modal's combobox)
    const jobSelect = screen.getByRole('combobox');
    fireEvent.change(jobSelect, { target: { value: 'job-1' } });

    // Submit — the modal's submit button is rendered after the candidate card buttons in the DOM
    const assignButtons = screen.getAllByRole('button', { name: /Assign Job/ });
    const modalSubmit = assignButtons[assignButtons.length - 1];
    fireEvent.click(modalSubmit);

    await waitFor(() => {
      expect(recruitmentApi.assignJobToCandidate).toHaveBeenCalledWith('1', { job_id: 'job-1' });
    });
  });

  it('creates a new job from inside the assign job popup and selects it', async () => {
    const mockCandidates = [
      {
        id: '1',
        full_name: 'Jane Smith',
        email: 'jane@example.com',
        source: 'Referral',
      }
    ];
    const mockJobs = [];
    const mockInterviews = [];

    recruitmentApi.getCandidates.mockResolvedValue({ data: { items: mockCandidates } });
    recruitmentApi.getInterviews.mockResolvedValue({ data: { items: mockInterviews } });
    recruitmentApi.getJobs.mockResolvedValue({ data: { items: mockJobs } });
    recruitmentApi.createJob.mockResolvedValue({
      data: { id: 'new-job-1', title: 'Product Manager' }
    });
    departmentsAPI.listDepartments.mockResolvedValue({
      departments: [
        { id: 'dept-1', name: 'Product' },
        { id: 'dept-2', name: 'Engineering' },
      ]
    });

    renderWithQueryClient(<CandidateInterviewScreen />);

    await waitFor(() => {
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    // Open the assign job popup
    fireEvent.click(screen.getAllByRole('button', { name: /Assign Job/ })[0]);

    await waitFor(() => {
      expect(screen.getByText('Select Job *')).toBeInTheDocument();
    });

    // Switch to create mode
    fireEvent.click(screen.getByRole('button', { name: /Create New Job/ }));

    await waitFor(() => {
      expect(screen.getByText('Create New Job')).toBeInTheDocument();
    });

    // Fill the create form
    fireEvent.change(screen.getByPlaceholderText('e.g. Frontend Developer'), {
      target: { value: 'Product Manager' }
    });
    fireEvent.change(screen.getByPlaceholderText('e.g. Remote / New York'), {
      target: { value: 'Remote' }
    });
    fireEvent.change(screen.getByPlaceholderText(/Brief description/), {
      target: { value: 'Own the product roadmap and lead discovery.' }
    });

    // Select department from the create form combobox
    const comboboxes = screen.getAllByRole('combobox');
    const deptSelect = comboboxes.find((box) => box.querySelector('option[value="dept-1"]'));
    fireEvent.change(deptSelect, { target: { value: 'dept-1' } });

    // Submit create form
    fireEvent.click(screen.getByRole('button', { name: /Create Job/ }));

    await waitFor(() => {
      expect(recruitmentApi.createJob).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Product Manager', department_id: 'dept-1' })
      );
    });

    // Back in select mode, the new job should be pre-selected so it can be assigned
    await waitFor(() => {
      expect(screen.getByText('Select Job *')).toBeInTheDocument();
    });
  });
});