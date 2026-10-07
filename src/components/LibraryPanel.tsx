import { useState } from 'react'
import { Download, Library, Music2, Plus, Trash2, Waves, AudioLines } from 'lucide-react'
import { useStudio } from '../state/store'
import { deleteLibraryItem, loadLibraryItem, renameLibraryItem } from '../db/library'
import type { LibraryItem } from '../state/types'
import { IconButton } from './Controls'

const ICON = { sample: AudioLines, kit: Music2, synth: Waves }

/** Sidebar list of the cross-project sound library. Items load onto the selected track or a new one. */
export function LibraryPanel({ onOpenLab }: { onOpenLab: () => void }) {
  const { library, selectedTrackId, project } = useStudio()
  const [filter, setFilter] = useState<'all' | LibraryItem['kind']>('all')
  const [editing, setEditing] = useState('')
  const track = project.tracks.find(item => item.id === selectedTrackId)
  const items = library.filter(item => filter === 'all' || item.kind === filter)
  const canLoadHere = (item: LibraryItem) =>
    item.kind === 'synth' ? track?.kind === 'synth' : track?.kind === 'drums' || track?.kind === 'keys'
  return (
    <>
      <div className="library-heading">
        <span className="library-title">
          <Library size={12} /> LIBRARY
        </span>
        <span>{String(library.length).padStart(2, '0')}</span>
      </div>
      <div className="library-filters" role="tablist" aria-label="Library filter">
        {(['all', 'kit', 'sample', 'synth'] as const).map(kind => (
          <button
            key={kind}
            role="tab"
            aria-selected={filter === kind}
            className={filter === kind ? 'selected' : ''}
            onClick={() => setFilter(kind)}
          >
            {kind}
          </button>
        ))}
      </div>
      <div className="sound-library">
        {!items.length && (
          <button className="library-empty" onClick={onOpenLab}>
            <Plus size={13} /> Nothing saved yet. Design a sound in the Lab or save a kit from the sample editor.
          </button>
        )}
        {items.map(item => {
          const Icon = ICON[item.kind]
          return (
            <div className={`library-item kind-${item.kind}`} key={item.id}>
              <Icon size={14} />
              {editing === item.id ? (
                <input
                  aria-label="Library item name"
                  autoFocus
                  defaultValue={item.name}
                  maxLength={32}
                  onBlur={event => {
                    void renameLibraryItem(item.id, event.target.value)
                    setEditing('')
                  }}
                  onKeyDown={event => {
                    if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                    if (event.key === 'Escape') setEditing('')
                  }}
                />
              ) : (
                <button
                  className="library-name"
                  onDoubleClick={() => setEditing(item.id)}
                  title="Double-click to rename"
                >
                  {item.name}
                  <small>
                    {item.kind === 'sample'
                      ? `${item.duration.toFixed(2)} s / ${item.slices.length || 1} slices`
                      : item.kind === 'kit'
                        ? `${item.pads.length} pads`
                        : 'synth patch'}
                  </small>
                </button>
              )}
              <IconButton
                title={canLoadHere(item) ? `Load onto ${track?.name}` : 'Load as a new track'}
                onClick={() =>
                  void loadLibraryItem(item, canLoadHere(item) ? { trackId: track!.id } : { newTrack: true })
                }
              >
                <Download size={13} />
              </IconButton>
              {canLoadHere(item) && (
                <IconButton title="Load as a new track" onClick={() => void loadLibraryItem(item, { newTrack: true })}>
                  <Plus size={13} />
                </IconButton>
              )}
              <IconButton
                title="Remove from library"
                onClick={() => {
                  if (confirm(`Remove "${item.name}" from the library?`)) void deleteLibraryItem(item.id)
                }}
              >
                <Trash2 size={13} />
              </IconButton>
            </div>
          )
        })}
      </div>
    </>
  )
}
