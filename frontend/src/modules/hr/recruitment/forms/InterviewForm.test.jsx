import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InterviewForm } from "./InterviewForm";

describe("InterviewForm", () => {
  it("submits selected names as backend ids", () => {
    const onSubmit = vi.fn();
    render(
      <InterviewForm
        onSubmit={onSubmit}
        candidates={[{ id: "candidate-1", full_name: "Ananya Rao" }]}
        jobs={[{ id: "job-1", title: "Frontend Engineer" }]}
        interviewers={[{ id: "user-1", full_name: "Nisha Shah" }]}
      />
    );

    fireEvent.change(screen.getByLabelText("Candidate"), { target: { value: "candidate-1" } });
    fireEvent.change(screen.getByLabelText("Job"), { target: { value: "job-1" } });
    fireEvent.click(screen.getByLabelText("Nisha Shah"));
    fireEvent.change(screen.getByLabelText("Scheduled at"), { target: { value: "2026-07-20T10:30" } });
    fireEvent.click(screen.getByRole("button", { name: "Save interview" }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      candidate_id: "candidate-1",
      job_id: "job-1",
      interviewer_ids: ["user-1"],
      schedule_at: "2026-07-20T10:30",
      duration_minutes: 60,
      round: 1,
    }));
  });

  it("shows validation instead of submitting when required selects are empty", () => {
    const onSubmit = vi.fn();
    render(<InterviewForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Save interview" }));

    expect(onSubmit).not.toHaveBeenCalled();
    const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
    expect(alerts).toEqual(expect.arrayContaining([
      "Select candidate",
      "Select job",
      "Select at least one interviewer",
      "Schedule time required",
    ]));
  });
});
