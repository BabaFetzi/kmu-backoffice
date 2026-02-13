import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../test/supabaseMock";
import Dashboard from "./Dashboard";

vi.mock("../lib/supabaseClient", () => ({
  supabase: createSupabaseMock({
    order_fulfillment_audit: { data: [], error: null },
    purchase_orders: { data: [], error: null },
    tasks: { data: [], error: null },
    items: { data: [], error: null },
    open_items_aging_view: { data: [], error: null },
  }),
}));

describe("Dashboard smoke", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders dashboard with cashflow forecast block", async () => {
    render(<Dashboard />);

    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Liquiditätsvorschau (30 Tage)")).toBeInTheDocument();
  });
});
