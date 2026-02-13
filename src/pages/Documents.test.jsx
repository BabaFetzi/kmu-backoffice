import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../test/supabaseMock";
import Documents from "./Documents";

vi.mock("../lib/supabaseClient", () => ({
  supabase: createSupabaseMock({
    orders: { data: [], error: null },
    payments: { data: [], error: null },
    dunning_templates: { data: [], error: null },
    company_profile: { data: [], error: null },
  }),
}));

describe("Documents smoke", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders documents page and bank import entry point", async () => {
    render(<Documents />);

    expect(await screen.findByText("Belege")).toBeInTheDocument();
    expect(screen.getByText("Bankabgleich (CSV)")).toBeInTheDocument();
  });
});
