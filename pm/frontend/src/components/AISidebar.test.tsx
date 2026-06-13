import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AISidebar } from "@/components/AISidebar";
import * as api from "@/lib/api";
import { initialData } from "@/lib/kanban";

vi.mock("@/lib/api", () => ({
  apiAiChat: vi.fn(),
}));

const onClose = vi.fn();
const onBoardUpdate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AISidebar", () => {
  it("renders empty state placeholder", () => {
    render(<AISidebar onClose={onClose} onBoardUpdate={onBoardUpdate} />);
    expect(screen.getByText(/ask me to update your board/i)).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    render(<AISidebar onClose={onClose} onBoardUpdate={onBoardUpdate} />);
    await userEvent.click(screen.getByRole("button", { name: /close ai sidebar/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose on Escape key", async () => {
    render(<AISidebar onClose={onClose} onBoardUpdate={onBoardUpdate} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("sends a message and shows the AI reply", async () => {
    vi.mocked(api.apiAiChat).mockResolvedValue({ reply: "You have 5 columns.", board: initialData });
    render(<AISidebar onClose={onClose} onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(screen.getByRole("textbox"), "How many columns?");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByText("How many columns?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("You have 5 columns.")).toBeInTheDocument());
  });

  it("shows loading indicator while request is in flight", async () => {
    let resolve: (v: { reply: string; board: typeof initialData }) => void;
    vi.mocked(api.apiAiChat).mockReturnValue(new Promise((r) => { resolve = r; }) as ReturnType<typeof api.apiAiChat>);
    render(<AISidebar onClose={onClose} onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(screen.getByRole("textbox"), "Hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    resolve!({ reply: "Hi!", board: initialData });
    await waitFor(() => expect(screen.queryByText(/thinking/i)).not.toBeInTheDocument());
  });

  it("calls onBoardUpdate when AI returns board changes", async () => {
    vi.mocked(api.apiAiChat).mockResolvedValue({ reply: "Done.", board: initialData });
    render(<AISidebar onClose={onClose} onBoardUpdate={onBoardUpdate} />);

    await userEvent.type(screen.getByRole("textbox"), "Move cards");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => expect(onBoardUpdate).toHaveBeenCalledWith(initialData));
  });
});
