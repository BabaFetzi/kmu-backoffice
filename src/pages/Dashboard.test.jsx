import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "../lib/supabaseClient";
import Dashboard from "./Dashboard";

// Mock the supabase client
vi.mock("../lib/supabaseClient", () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe("Dashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(supabase.from).mockReset();
  });

  it("renders a loading state initially and then the content", async () => {
    // Arrange: Mock a successful response for all calls
    vi.mocked(supabase.from).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

    render(<Dashboard />);

    // Assert: The loading state is present initially
    expect(screen.getByText("Lade Daten...")).toBeInTheDocument();

    // Assert: The main content is rendered after loading
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Liquiditätsvorschau (30 Tage)")).toBeInTheDocument();

    // Assert: The loading state is gone after content is loaded
    expect(screen.queryByText("Lade Daten...")).not.toBeInTheDocument();
  });

  it("displays an error message if data fetching fails", async () => {
    // Arrange: Mock an error response from the first supabase call
    vi.mocked(supabase.from).mockImplementation((tableName) => {
      if (tableName === "order_fulfillment_audit") {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: null, error: { message: "Error fetching orders" } }),
        };
      }
      // Return success for all other calls to not over-complicate the test
      return {
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      };
    });

    render(<Dashboard />);

    // Assert: The error message is shown
    expect(await screen.findByText("Error fetching orders")).toBeInTheDocument();

    // Assert: The loading state is gone
    expect(screen.queryByText("Lade Daten...")).not.toBeInTheDocument();

    // Assert: The main content is not present
    expect(screen.queryByText("Liquiditätsvorschau (30 Tage)")).not.toBeInTheDocument();
  });
});
