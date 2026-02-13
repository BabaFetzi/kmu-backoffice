import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "../test/supabaseMock";
import Customers from "./Customers";

vi.mock("../lib/supabaseClient", () => ({
  supabase: createSupabaseMock({
    customers: { data: [], error: null },
    orders: { data: [], error: null },
  }),
}));

describe("Customers smoke", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders customer page without crashing", async () => {
    render(<Customers />);

    expect(await screen.findByText("Kunden")).toBeInTheDocument();
    expect(screen.getByText("KI-Assistent")).toBeInTheDocument();
  });
});
