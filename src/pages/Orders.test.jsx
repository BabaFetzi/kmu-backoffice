import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../test/supabaseMock";
import Orders from "./Orders";

vi.mock("../lib/supabaseClient", () => ({
  supabase: createSupabaseMock({
    items: { data: [], error: null },
    customers: { data: [], error: null },
    orders: { data: [], error: null },
    company_profile: { data: [], error: null },
  }),
}));

describe("Orders smoke", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders orders page and empty state", async () => {
    render(<Orders />);

    expect(await screen.findByText("Aufträge")).toBeInTheDocument();
    expect(await screen.findByText("Keine Aufträge.")).toBeInTheDocument();
  });
});
