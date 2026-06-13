"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { AISidebar } from "@/components/AISidebar";
import { moveCard, type BoardData, type Card } from "@/lib/kanban";
import {
  apiLogout,
  apiGetBoard,
  apiCreateCard,
  apiDeleteCard,
  apiReorder,
  apiRenameColumn,
} from "@/lib/api";

type KanbanBoardProps = {
  onLogout?: () => void;
};

export const KanbanBoard = ({ onLogout }: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const savedBoard = useRef<BoardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    apiGetBoard().then(setBoard);
  }, []);

  const cardsById = useMemo((): Record<string, Card> => board?.cards ?? {}, [board]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
    savedBoard.current = board;
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    // Only update state for cross-column moves; SortableContext handles same-column visuals
    setBoard((prev) => {
      if (!prev) return prev;
      const activeColId = prev.columns.find((c) => c.cardIds.includes(activeId))?.id;
      const overColId =
        prev.columns.find((c) => c.id === overId)?.id ??
        prev.columns.find((c) => c.cardIds.includes(overId))?.id;
      if (!activeColId || !overColId || activeColId === overColId) return prev;
      return { ...prev, columns: moveCard(prev.columns, activeId, overId) };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);
    savedBoard.current = null;
    const activeId = active.id as string;
    setBoard((prev) => {
      if (!prev) return prev;
      const targetCol = prev.columns.find((col) => col.cardIds.includes(activeId));
      if (!targetCol) return prev;
      // Same-column reorder: apply arrayMove now that drag is committed
      if (over && over.id !== activeId) {
        const overId = over.id as string;
        const activeIdx = targetCol.cardIds.indexOf(activeId);
        const overIdx = targetCol.cardIds.indexOf(overId);
        if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
          const newCardIds = arrayMove(targetCol.cardIds, activeIdx, overIdx);
          const newColumns = prev.columns.map((col) =>
            col.id === targetCol.id ? { ...col, cardIds: newCardIds } : col
          );
          apiReorder(activeId, targetCol.id, newCardIds.indexOf(activeId));
          return { ...prev, columns: newColumns };
        }
      }
      // Cross-column (already positioned by onDragOver) or no change — just persist
      apiReorder(activeId, targetCol.id, targetCol.cardIds.indexOf(activeId));
      return prev;
    });
  };

  const handleDragCancel = () => {
    setActiveCardId(null);
    if (savedBoard.current) {
      setBoard(savedBoard.current);
      savedBoard.current = null;
    }
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    setBoard((prev) =>
      prev
        ? { ...prev, columns: prev.columns.map((col) => (col.id === columnId ? { ...col, title } : col)) }
        : prev
    );
  };

  const handleRenameColumnCommit = (columnId: string, title: string) => {
    apiRenameColumn(columnId, title);
  };

  const handleAddCard = async (columnId: string, title: string, details: string): Promise<void> => {
    const card = await apiCreateCard(columnId, title, details);
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            cards: { ...prev.cards, [card.id]: card },
            columns: prev.columns.map((col) =>
              col.id === columnId ? { ...col, cardIds: [...col.cardIds, card.id] } : col
            ),
          }
        : prev
    );
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    setBoard((prev) =>
      prev
        ? {
            ...prev,
            cards: Object.fromEntries(Object.entries(prev.cards).filter(([id]) => id !== cardId)),
            columns: prev.columns.map((col) =>
              col.id === columnId ? { ...col, cardIds: col.cardIds.filter((id) => id !== cardId) } : col
            ),
          }
        : prev
    );
    apiDeleteCard(cardId);
  };

  const activeCard = activeCardId ? cardsById[activeCardId] ?? null : null;

  if (!board) return null;

  return (
    <div className="relative flex h-screen overflow-hidden">
      <div className="pointer-events-none absolute left-0 top-0 h-[420px] w-[420px] -translate-x-1/3 -translate-y-1/3 rounded-full bg-[radial-gradient(circle,_rgba(32,157,215,0.25)_0%,_rgba(32,157,215,0.05)_55%,_transparent_70%)]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[520px] w-[520px] translate-x-1/4 translate-y-1/4 rounded-full bg-[radial-gradient(circle,_rgba(117,57,145,0.18)_0%,_rgba(117,57,145,0.05)_55%,_transparent_75%)]" />

      <div className="flex-1 overflow-y-auto">
      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSidebarOpen((o) => !o)}
                aria-expanded={sidebarOpen}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--secondary-purple)] hover:text-[var(--secondary-purple)]"
              >
                AI Chat
              </button>
              <button
                type="button"
                onClick={async () => { await apiLogout(); onLogout?.(); }}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)] transition hover:border-[var(--navy-dark)] hover:text-[var(--navy-dark)]"
              >
                Sign out
              </button>
            </div>
            <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                Focus
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                One board. Five columns. Zero clutter.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onRenameCommit={handleRenameColumnCommit}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>
      </div>

      {sidebarOpen && (
        <AISidebar
          onBoardUpdate={(newBoard) => setBoard(newBoard)}
          onClose={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
};
