import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  apiGetBoard: vi.fn(),
  apiLogout: vi.fn(),
  apiRenameColumn: vi.fn(),
  apiCreateCard: vi.fn(),
  apiDeleteCard: vi.fn(),
  apiReorder: vi.fn(),
  apiMe: vi.fn(),
  apiLogin: vi.fn(),
  apiAiChat: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(api.apiGetBoard).mockResolvedValue(JSON.parse(JSON.stringify(initialData)));
  vi.mocked(api.apiCreateCard).mockImplementation(async (_col, title, details) => ({
    id: "new-1",
    title,
    details,
  }));
  vi.mocked(api.apiDeleteCard).mockResolvedValue(undefined);
  vi.mocked(api.apiRenameColumn).mockResolvedValue(undefined);
  vi.mocked(api.apiReorder).mockResolvedValue(undefined);
  vi.mocked(api.apiLogout).mockResolvedValue(undefined);
});

const waitForBoard = () =>
  waitFor(() => expect(screen.getAllByTestId(/column-/i)).toHaveLength(5));

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns from the API", async () => {
    render(<KanbanBoard />);
    await waitForBoard();
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    await waitForBoard();
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("opens and closes the AI sidebar on toggle click", async () => {
    render(<KanbanBoard />);
    await waitForBoard();

    expect(screen.queryByRole("dialog", { name: /ai assistant/i })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /ai chat/i }));
    expect(screen.getByRole("dialog", { name: /ai assistant/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /ai chat/i }));
    expect(screen.queryByRole("dialog", { name: /ai assistant/i })).not.toBeInTheDocument();
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    await waitForBoard();
    const column = getFirstColumn();

    await userEvent.click(within(column).getByRole("button", { name: /add a card/i }));
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "New card");
    await userEvent.type(within(column).getByPlaceholderText(/details/i), "Notes");
    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    await waitFor(() => expect(within(column).getByText("New card")).toBeInTheDocument());

    await userEvent.click(within(column).getByRole("button", { name: /delete new card/i }));
    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });
});
