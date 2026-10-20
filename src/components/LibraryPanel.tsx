import { useState } from 'react'
import { Download, Library, Music2, Package, Plus, Trash2, Waves, AudioLines, Grid2X2 } from 'lucide-react'
import { reportError, useStudio } from '../state/store'
import { deleteLibraryItem, loadLibraryItem, loadSampleToPad, renameLibraryItem } from '../db/library'
import { installPack, PACKS, packInstalled } from '../content/packs'
import type { LibraryItem } from '../state/types'
import { IconButton } from './Controls'

const ICON = { sample: AudioLines, kit: Music2, synth: Waves }

/** Sidebar list of the cross-project sound library. Items load onto the selected track or a new one. */
export function LibraryPanel({ onOpenLab }: { onOpenLab: () => void }) {
  const { library, selectedTrackId, selectedPadId, project } = useStudio()
  const [filter, setFilter] = useState<'all' | LibraryItem['kind']>('all')
  const [editing, setEditing] = useState('')
  const [packs, setPacks] = useState(false)
  const [installing, setInstalling] = useState('')
  const track = project.tracks.find(item => item.id === selectedTrackId)
  const padIndex = track?.pads.findIndex(pad => pad.id === selectedPadId) ?? -1
  const install = async (id: string) => {
    const pack = PACKS.find(item => item.id === id)!
    setInstalling(`${pack.id}:0`)
    try {
      await installPack(pack, (done, total) => setInstalling(`${pack.id}:${Math.round((done / total) * 100)}`))
    } catch (error) {
      reportError(error)
    } finally {
      setInstalling('')
    }
  }
  const items = library.filter(item => filter === 'all' || item.kind === filter)
  const canLoadHere = (item: LibraryItem) =>
    item.kind === 'synth' ? track?.kind === 'synth' : track?.kind === 'drums' || track?.kind === 'keys'
  return (
    <>
      <div className="library-heading">
        <span className="library-title">
          <Library size={12} /> LIBRARY
        </span>
        <span>
          <button
            className="packs-toggle"
            onClick={() => setPacks(!packs)}
            aria-expanded={packs}
            title="Factory sound packs"
          >
            <Package size={11} /> PACKS
          </button>
          {String(library.length).padStart(2, '0')}
        </span>
      </div>
      {packs && (
        <div className="pack-list" aria-label="Sound packs">
          {PACKS.map(pack => {
            const installed = packInstalled(pack)
            const busy = installing.startsWith(`${pack.id}:`)
            return (
              <div className="pack-item" key={pack.id}>
                <div>
                  <strong>{pack.name}</strong>
                  <small>
                    {pack.blurb} {pack.kits.length} kits, {pack.patches.length} patches.
                  </small>
                </div>
                <button disabled={installed || Boolean(installing)} onClick={() => void install(pack.id)}>
                  {installed ? 'Installed' : busy ? `${installing.split(':')[1]}%` : 'Install'}
                </button>
              </div>
            )
          })}
        </div>
      )}
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
              <div className="library-item-top">
                <Icon size={13} aria-hidden="true" />
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
                    title={`${item.name}. Double-click to rename`}
                  >
                    {item.name}
                  </button>
                )}
              </div>
              <div className="library-item-bottom">
                <small>
                  {item.kind === 'sample'
                    ? `${item.duration.toFixed(2)}s · ${item.slices.length || 1} slices`
                    : item.kind === 'kit'
                      ? `${item.pads.length} pads`
                      : 'synth patch'}
                </small>
                <IconButton
                  title={canLoadHere(item) ? `Load onto ${track?.name}` : 'Load as a new track'}
                  onClick={() =>
                    void loadLibraryItem(item, canLoadHere(item) ? { trackId: track!.id } : { newTrack: true })
                  }
                >
                  <Download size={12} />
                </IconButton>
                {canLoadHere(item) && (
                  <IconButton
                    title="Load as a new track"
                    onClick={() => void loadLibraryItem(item, { newTrack: true })}
                  >
                    <Plus size={12} />
                  </IconButton>
                )}
                {item.kind === 'sample' && track?.kind === 'drums' && padIndex >= 0 && (
                  <IconButton
                    title={`Put on pad ${padIndex + 1} of ${track.name}`}
                    onClick={() => void loadSampleToPad(item, track.id, selectedPadId)}
                  >
                    <Grid2X2 size={12} />
                  </IconButton>
                )}
                <IconButton
                  title="Remove from library"
                  onClick={() => {
                    if (confirm(`Remove "${item.name}" from the library?`)) void deleteLibraryItem(item.id)
                  }}
                >
                  <Trash2 size={12} />
                </IconButton>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
