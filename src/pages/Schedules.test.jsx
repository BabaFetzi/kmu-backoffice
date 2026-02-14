import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../test/supabaseMock";
import Schedules from "./Schedules";

vi.mock("../lib/supabaseClient", () => ({
  supabase: createSupabaseMock({
    employee_schedules: { data: [], error: null },
    app_users: { data: [], error: null },
    employee_planner_events: { data: [], error: null },
  }),
}));

describe("Schedules smoke", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders schedules dashboard shell", async () => {
    render(<Schedules />);

    expect(await screen.findByText("Stundenplan Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
    expect(screen.getByText("Kein kommender Termin")).toBeInTheDocument();
    expect(screen.queryByText("Break Time")).not.toBeInTheDocument();
  });
});
