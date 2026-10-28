import { FREE, indexOf, lineCells, type Game, type OpenedEntry } from "../../../shared/game";

type Props = {
  game: Game;
  card: string[];
  opened: Record<string, OpenedEntry>;
  nicknames: Record<string, string>;
  justOpened: number | null;
  onCell: (index: number) => void;
};

export function Board({ game, card, opened, nicknames, justOpened, onCell }: Props) {
  const cells = indexOf(game).cells;
  const winning = lineCells(Object.keys(opened).map(Number));
  return (
    <section className="board" aria-label="ビンゴカード">
      {["B", "I", "N", "G", "O"].map((l) => (
        <div key={l} className="head" aria-hidden="true">
          {l}
        </div>
      ))}
      {card.map((id, i) => {
        const line = winning.has(i) ? " line" : "";
        if (id === FREE)
          return (
            <div key={i} className={`cell free open${line}`}>
              <span>FREE</span>
            </div>
          );
        const o = opened[String(i)];
        const label = cells[id]?.label ?? "";
        const name = o ? nicknames[o.by] ?? "参加者" : "";
        return (
          <button
            key={i}
            className={`cell${o ? " open" : ""}${line}${justOpened === i ? " hit" : ""}`}
            aria-label={o ? `${label}（${name}さんと開けた）` : label}
            onClick={() => onCell(i)}
          >
            <span>{label}</span>
            {o && (
              <i className="by" aria-hidden="true">
                {[...name][0]}
              </i>
            )}
          </button>
        );
      })}
    </section>
  );
}
