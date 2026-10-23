import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useRepository } from '@/app/RepositoryContext';
import { useSite, useSiteData } from '@/app/SiteContext';
import { defaultBlockContent } from '@/content/defaults';
import { slugify, uniqueSlug } from '@/content/localize';
import { BLOCK_TYPES, BLOCK_TYPE_INFO, type BlockType, type ContentBlock } from '@/content/schema';
import { Modal, useConfirm, useSaver } from '../feedback';
import { EmptyState, MoveButtons, Notice, PageHeader, SelectField, TextField, Toggle, moveItem } from '../ui';

export function SectionsPage() {
  const repo = useRepository();
  const { reload } = useSite();
  const data = useSiteData();
  const saver = useSaver();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  if (!data) return null;
  const blocks = data.blocks;

  const act = (fn: () => Promise<unknown>, message: string) =>
    saver.run(async () => {
      await fn();
      await reload();
    }, message);

  const move = (from: number, to: number) => {
    const ids = moveItem(blocks.map((b) => b.id), from, to);
    void act(() => repo.reorderBlocks(ids), 'Order saved');
  };

  const remove = async (id: string, label: string) => {
    const yes = await confirm({
      title: `Delete section “${label}”?`,
      message: 'The section and its content will be removed permanently. This cannot be undone.',
      confirmLabel: 'Delete section',
      danger: true,
    });
    if (yes) void act(() => repo.deleteBlock(id), 'Section deleted');
  };

  return (
    <>
      <PageHeader
        title="Sections"
        subtitle="The blocks that make up the home page, top to bottom."
        actions={
          <button type="button" className="a-btn a-btn--primary" onClick={() => setAdding(true)}>
            Add section
          </button>
        }
      />

      {blocks.length === 0 && data.invalidBlocks.length === 0 ? (
        <EmptyState title="The page has no sections">Add a hero to get started.</EmptyState>
      ) : (
        <ul className="a-list" aria-busy={saver.saving}>
          {blocks.map((b, i) => (
            <li key={b.id} className={`a-row a-row--block ${b.isVisible ? '' : 'is-hidden'}`}>
              <div className="a-row__main">
                <Link to={`/admin/sections/${b.id}`} className="a-row__title">
                  {b.adminLabel}
                </Link>
                <span className="a-hint">
                  {BLOCK_TYPE_INFO[b.type].label} · #{b.anchor}
                  {!b.isVisible && ' · hidden'}
                </span>
              </div>
              <Toggle
                label={`Show ${b.adminLabel} on the site`}
                checked={b.isVisible}
                disabled={saver.saving}
                onChange={(v) => void act(() => repo.updateBlock(b.id, b.type, { isVisible: v }), v ? 'Section is now visible' : 'Section hidden')}
              />
              <div className="a-row__actions">
                <MoveButtons index={i} count={blocks.length} onMove={move} disabled={saver.saving} label={b.adminLabel} />
                <Link className="a-btn a-btn--small" to={`/admin/sections/${b.id}`}>
                  Edit
                </Link>
                <button type="button" className="a-btn a-btn--small a-btn--danger-quiet" disabled={saver.saving} onClick={() => void remove(b.id, b.adminLabel)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {data.invalidBlocks.map((b) => (
            <li key={b.id} className="a-row a-row--block is-invalid">
              <div className="a-row__main">
                <span className="a-row__title">{b.adminLabel}</span>
                <span className="a-hint">Content is invalid for type “{b.type}” and is not shown on the site.</span>
              </div>
              <div className="a-row__actions">
                <button type="button" className="a-btn a-btn--small a-btn--danger-quiet" onClick={() => void remove(b.id, b.adminLabel)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddSection
          existingAnchors={[...blocks.map((b) => b.anchor), ...data.invalidBlocks.map(() => '')]}
          onClose={() => setAdding(false)}
          onCreate={async (type, label) => {
            let created: ContentBlock | null = null;
            const ok = await act(async () => {
              created = await repo.createBlock({
                type,
                adminLabel: label,
                anchor: uniqueSlug(slugify(label) || type, blocks.map((b) => b.anchor)),
                isVisible: false,
                content: defaultBlockContent(type),
              });
            }, 'Section added (hidden until you show it)');
            if (ok && created) {
              setAdding(false);
              navigate(`/admin/sections/${(created as ContentBlock).id}`);
            }
          }}
          busy={saver.saving}
          error={saver.error?.message}
        />
      )}
    </>
  );
}

function AddSection({
  onClose,
  onCreate,
  busy,
  error,
}: {
  existingAnchors: string[];
  onClose: () => void;
  onCreate: (type: BlockType, label: string) => void;
  busy: boolean;
  error: string | undefined;
}) {
  const [type, setType] = useState<BlockType>('text');
  const [label, setLabel] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (label.trim()) onCreate(type, label.trim());
  };
  return (
    <Modal title="Add a section" onClose={onClose} labelledBy="add-section-title">
      <form onSubmit={submit} noValidate>
        <div className="a-modal__body">
          <SelectField
            label="Type"
            value={type}
            options={BLOCK_TYPES.map((t) => ({ value: t, label: BLOCK_TYPE_INFO[t].label }))}
            hint={BLOCK_TYPE_INFO[type].description}
            onChange={setType}
          />
          <TextField label="Name (only you see this)" value={label} required onChange={setLabel} />
          {error && <Notice kind="error">{error}</Notice>}
        </div>
        <div className="a-modal__actions">
          <button type="button" className="a-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="a-btn a-btn--primary" disabled={busy || !label.trim()}>
            {busy ? 'Adding…' : 'Add section'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
