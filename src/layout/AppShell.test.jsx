import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("filters modules and navigates to selected entry", () => {
    const onNavigate = vi.fn();
    const onLogout = vi.fn();

    render(
      <AppShell
        userEmail="team@example.com"
        active="dashboard"
        onNavigate={onNavigate}
        onLogout={onLogout}
        glassIntensity="strong"
        onGlassIntensityChange={vi.fn()}
      >
        <div>workspace content</div>
      </AppShell>
    );

    fireEvent.change(screen.getByLabelText("Modul suchen"), { target: { value: "Belege" } });

    const targetButton = screen.getByRole("button", { name: "Belege" });
    expect(targetButton).toBeInTheDocument();

    fireEvent.click(targetButton);
    expect(onNavigate).toHaveBeenCalledWith("documents");

    expect(screen.queryByRole("button", { name: "Aufträge" })).not.toBeInTheDocument();
  });
});
