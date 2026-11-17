type Item = { id: string; text: string };
type Props = { items: Item[]; working: boolean; onAdd: () => void; onGo: (id: string) => void };

export function AddAll({ items, working, onAdd, onGo }: Props) {
  return (
    <div className="m"><div className="b" id="add-all-bar" tabIndex={-1} role="group" aria-label="Decide on all open changes">
      <p><b>{items.length} changes ready</b></p>
      <ul style={{ margin: "6px 0", paddingLeft: 18 }}>
        {items.map((i) => (
          <li key={i.id}>{i.text} <button className="btn sm" type="button" aria-label={`Go to card: ${i.text}`} onClick={() => onGo(i.id)}>Go to card</button></li>
        ))}
      </ul>
      <div className="acts">
        <button className="btn sm primary" type="button" disabled={working} onClick={onAdd}>Add all</button>
      </div>
    </div></div>
  );
}
