import { useEffect, useRef, useState } from 'react';
import { X, Check, Trash2, Power, PowerOff, Info, Pencil, Loader2, GripVertical, AlertTriangle } from 'lucide-react';
import type { Mod } from '../types/mod';
import { ArchivedTag, Button, Tag } from './common/ui';

type DropPosition = 'before' | 'after';

interface Props {
    /** Display name shared by the variants (use primary.name). */
    modName: string;
    variants: Mod[];
    /** Called when the user toggles one file in the selection. */
    onSetVariantEnabled: (variant: Mod, enabled: boolean) => Promise<void> | void;
    /** Persist a new file order for this group. Receives filenames because
     *  priority rewrites change ids when pak##_ prefixes are renamed. */
    onReorderVariants: (orderedFileNames: string[]) => Promise<void> | void;
    /** Conflicts keyed by local mod id. Only in-group conflicts are passed in. */
    conflictsByVariantId?: Record<string, string[]>;
    /** Called when the user requests deletion of a single variant. */
    onDeleteVariant: (variant: Mod) => Promise<void> | void;
    /** Persist a user-given label for a variant. Empty string clears it. */
    onRenameVariant: (variant: Mod, label: string) => Promise<void> | void;
    /** Optional - open the GameBanana details modal for this mod. When set,
     *  a small "Mod page" link appears in the header. */
    onOpenModDetails?: () => void;
    onClose: () => void;
}

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Selection modal for grouped mods. Shown when an Installed card represents
 * multiple VPKs sharing a GameBanana mod id. Any subset can be enabled.
 */
export default function VariantPickerModal({
    modName,
    variants,
    onSetVariantEnabled,
    onReorderVariants,
    conflictsByVariantId = {},
    onDeleteVariant,
    onRenameVariant,
    onOpenModDetails,
    onClose,
}: Props) {
    const [pending, setPending] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);
    // Per-row rename state. Holds the file id being edited plus the working
    // draft text; null when no row is in edit mode.
    const [editing, setEditing] = useState<{ id: string; draft: string } | null>(null);
    const editInputRef = useRef<HTMLInputElement | null>(null);
    const dragHandleDownRef = useRef(false);

    // Focus + select when the editing target changes. Driven by the id alone
    // so we do not re-focus on every keystroke as the draft updates.
    const editingId = editing?.id ?? null;
    useEffect(() => {
        if (editingId && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [editingId]);

    const enabledCount = variants.filter((v) => v.enabled).length;
    const allEnabled = enabledCount === variants.length;
    const controlsDisabled = !!pending || !!editing;
    const canDrag = !controlsDisabled && variants.length > 1;

    const startRename = (v: Mod) => {
        setEditing({ id: v.id, draft: v.variantLabel ?? '' });
    };

    const cancelRename = () => setEditing(null);

    const commitRename = async (v: Mod) => {
        if (!editing || editing.id !== v.id || pending) return;
        const next = editing.draft.trim();
        // No-op when the value has not changed; avoids a needless metadata write.
        if (next === (v.variantLabel ?? '')) {
            setEditing(null);
            return;
        }
        setPending(`rename:${v.id}`);
        try {
            await onRenameVariant(v, next);
            setEditing(null);
        } finally {
            setPending(null);
        }
    };

    const setVariantEnabled = async (target: Mod, enabled: boolean) => {
        if (pending) return;
        setPending(target.id);
        try {
            await onSetVariantEnabled(target, enabled);
        } finally {
            setPending(null);
        }
    };

    const setAllEnabled = async (enabled: boolean) => {
        if (pending) return;
        const targets = variants.filter((v) => v.enabled !== enabled);
        if (targets.length === 0) return;
        setPending(enabled ? '__enable_all__' : '__disable_all__');
        try {
            for (const target of targets) {
                await onSetVariantEnabled(target, enabled);
            }
        } finally {
            setPending(null);
        }
    };

    const handleDelete = async (variant: Mod) => {
        if (pending || editing) return;
        setPending(`delete:${variant.id}`);
        try {
            await onDeleteVariant(variant);
        } finally {
            setPending(null);
        }
    };

    const resetDragState = () => {
        setDraggingId(null);
        setDropTargetId(null);
        setDropPosition(null);
        dragHandleDownRef.current = false;
    };

    const applyReorder = async (
        sourceId: string,
        targetId: string,
        position: DropPosition
    ) => {
        if (sourceId === targetId || pending) return;

        const working = variants.slice();
        const sourceIdx = working.findIndex((v) => v.id === sourceId);
        if (sourceIdx === -1) return;
        const [source] = working.splice(sourceIdx, 1);

        const targetIdx = working.findIndex((v) => v.id === targetId);
        if (targetIdx === -1) return;
        const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
        working.splice(insertAt, 0, source);

        const unchanged = working.every((v, i) => v.id === variants[i]?.id);
        if (unchanged) return;

        setPending('__reorder__');
        try {
            await onReorderVariants(working.map((v) => v.fileName));
        } finally {
            setPending(null);
        }
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 animate-fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="variant-picker-title"
            onClick={onClose}
        >
            <div
                className="bg-bg-secondary border border-border rounded-xl w-full max-w-xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-border gap-3">
                    <div className="min-w-0">
                        <h3 id="variant-picker-title" className="text-lg font-semibold text-text-primary truncate">
                            {modName}
                        </h3>
                        <p className="text-xs text-text-secondary mt-0.5">
                            {enabledCount} of {variants.length} files enabled
                        </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {onOpenModDetails && (
                            <button
                                onClick={onOpenModDetails}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-text-secondary hover:text-text-primary border border-border hover:border-accent/40 rounded cursor-pointer transition-colors"
                                title="Open the GameBanana mod page"
                            >
                                <Info className="w-3.5 h-3.5" />
                                Mod page
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-1 text-text-secondary hover:text-text-primary rounded cursor-pointer"
                            aria-label="Close"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                <div className="p-3 max-h-[60vh] overflow-y-auto space-y-1.5">
                    {variants.map((v) => {
                        const isEnabled = v.enabled;
                        const isPending = pending === v.id;
                        const isDeletePending = pending === `delete:${v.id}`;
                        const isEditing = editing?.id === v.id;
                        const isRenamePending = pending === `rename:${v.id}`;
                        const isDragging = draggingId === v.id;
                        const conflictDetails = conflictsByVariantId[v.id] ?? [];
                        const rowDropPosition = dropTargetId === v.id ? dropPosition : null;
                        const dropIndicatorClass = rowDropPosition
                            ? `absolute left-2 right-2 ${rowDropPosition === 'before' ? '-top-[3px]' : '-bottom-[3px]'} h-[3px] bg-accent rounded-full pointer-events-none`
                            : '';
                        // Title precedence: user rename wins, then the
                        // GameBanana file header, then the original GB
                        // filename stem, and finally the local VPK filename.
                        // Show the local filename as a secondary line whenever
                        // we used a friendlier label up top.
                        const primaryTitle =
                            v.variantLabel ??
                            v.fileDescription ??
                            v.sourceFileName ??
                            v.fileName;
                        const showSecondaryFileName =
                            !!v.variantLabel || !!v.fileDescription || !!v.sourceFileName;

                        return (
                            <div
                                key={v.id}
                                className={`relative flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                                    isEnabled
                                        ? 'border-accent/40 bg-accent/5'
                                        : 'border-border bg-bg-tertiary hover:bg-white/5'
                                } ${isDragging ? 'opacity-40' : ''}`}
                                draggable={canDrag}
                                onDragStart={(e) => {
                                    if (!canDrag || !dragHandleDownRef.current) {
                                        e.preventDefault();
                                        return;
                                    }
                                    dragHandleDownRef.current = false;
                                    e.dataTransfer.effectAllowed = 'move';
                                    try {
                                        e.dataTransfer.setData('text/plain', v.id);
                                    } catch {
                                        // Some drag implementations do not allow setting data.
                                    }
                                    setDraggingId(v.id);
                                }}
                                onDragOver={(e) => {
                                    if (!draggingId || draggingId === v.id || !canDrag) return;
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'move';
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const mid = rect.top + rect.height / 2;
                                    setDropTargetId(v.id);
                                    setDropPosition(e.clientY < mid ? 'before' : 'after');
                                }}
                                onDragLeave={(e) => {
                                    const related = e.relatedTarget as Node | null;
                                    if (related && e.currentTarget.contains(related)) return;
                                    if (dropTargetId === v.id) {
                                        setDropTargetId(null);
                                        setDropPosition(null);
                                    }
                                }}
                                onDrop={(e) => {
                                    if (!draggingId || !dropTargetId || !dropPosition) return;
                                    e.preventDefault();
                                    void applyReorder(draggingId, dropTargetId, dropPosition).finally(resetDragState);
                                }}
                                onDragEnd={resetDragState}
                            >
                                {dropIndicatorClass && <div className={dropIndicatorClass} />}
                                <div
                                    onMouseDown={() => {
                                        if (canDrag) dragHandleDownRef.current = true;
                                    }}
                                    onMouseUp={() => {
                                        dragHandleDownRef.current = false;
                                    }}
                                    className={`p-1 text-text-secondary hover:text-text-primary select-none flex-shrink-0 ${
                                        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default opacity-40'
                                    }`}
                                    title="Drag to reorder"
                                    aria-label="Drag to reorder"
                                >
                                    <GripVertical className="w-5 h-5" />
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setVariantEnabled(v, !isEnabled)}
                                    disabled={controlsDisabled}
                                    className="flex-1 min-w-0 text-left cursor-pointer disabled:cursor-default disabled:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded"
                                    title={isEnabled ? 'Disable this file' : 'Enable this file'}
                                >
                                    <div className="flex items-center gap-3">
                                        <span
                                            className={`flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center ${
                                                isEnabled ? 'border-accent bg-accent' : 'border-border bg-bg-secondary'
                                            }`}
                                            aria-hidden
                                        >
                                            {isEnabled && <Check className="w-2.5 h-2.5 text-black" strokeWidth={3} />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            {isEditing ? (
                                                <input
                                                    ref={editInputRef}
                                                    type="text"
                                                    value={editing.draft}
                                                    onChange={(e) => setEditing({ id: v.id, draft: e.target.value })}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onKeyDown={(e) => {
                                                        e.stopPropagation();
                                                        if (e.key === 'Enter') {
                                                            e.preventDefault();
                                                            void commitRename(v);
                                                        } else if (e.key === 'Escape') {
                                                            e.preventDefault();
                                                            cancelRename();
                                                        }
                                                    }}
                                                    placeholder="e.g. Red preset"
                                                    maxLength={80}
                                                    className="w-full bg-bg-secondary border border-accent/50 rounded px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent"
                                                />
                                            ) : (
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span
                                                        className={`truncate ${showSecondaryFileName ? 'text-sm text-text-primary font-medium' : 'font-mono text-sm text-text-primary'}`}
                                                        title={primaryTitle}
                                                    >
                                                        {primaryTitle}
                                                    </span>
                                                    {isEnabled && (
                                                        <span className="text-[10px] uppercase tracking-wide bg-accent/20 text-accent rounded px-1.5 py-0.5 flex-shrink-0">
                                                            Enabled
                                                        </span>
                                                    )}
                                                    {v.isArchived && <ArchivedTag />}
                                                    {conflictDetails.length > 0 && (
                                                        <Tag
                                                            tone="warning"
                                                            icon={AlertTriangle}
                                                            title={conflictDetails.join(', ')}
                                                            className="flex-shrink-0"
                                                        >
                                                            Conflict
                                                        </Tag>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 text-xs text-text-secondary mt-0.5 min-w-0">
                                                <span className="flex-shrink-0">{formatBytes(v.size)}</span>
                                                <span className="opacity-50 flex-shrink-0">-</span>
                                                <span className="flex-shrink-0">Slot #{v.priority}</span>
                                                {showSecondaryFileName && !isEditing && (
                                                    <>
                                                        <span className="opacity-50 flex-shrink-0">-</span>
                                                        <span className="font-mono truncate opacity-70" title={v.fileName}>
                                                            {v.fileName}
                                                        </span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                                {isEditing ? (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => commitRename(v)}
                                            disabled={!!pending}
                                            className="p-1.5 text-accent hover:bg-accent/10 rounded transition-colors cursor-pointer disabled:opacity-50"
                                            title="Save"
                                            aria-label="Save file name"
                                        >
                                            {isRenamePending ? (
                                                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Check className="w-4 h-4" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={cancelRename}
                                            disabled={!!pending}
                                            className="p-1.5 text-text-secondary hover:text-text-primary hover:bg-white/5 rounded transition-colors cursor-pointer disabled:opacity-50"
                                            title="Cancel"
                                            aria-label="Cancel rename"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => startRename(v)}
                                            disabled={controlsDisabled}
                                            className="flex-shrink-0 p-1.5 text-text-secondary hover:text-accent hover:bg-accent/10 rounded transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
                                            title={v.variantLabel ? 'Rename file' : 'Give this file a name'}
                                            aria-label="Rename file"
                                        >
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(v)}
                                            disabled={controlsDisabled}
                                            className="flex-shrink-0 p-1.5 text-text-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-colors cursor-pointer disabled:cursor-default disabled:opacity-50"
                                            title={`Delete ${primaryTitle}`}
                                            aria-label={`Delete ${primaryTitle}`}
                                        >
                                            {isDeletePending ? (
                                                <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                            ) : (
                                                <Trash2 className="w-4 h-4" />
                                            )}
                                        </button>
                                    </>
                                )}
                                {isPending && (
                                    <span className="text-xs text-accent inline-flex items-center gap-1">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Saving
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex items-center justify-between gap-3 p-5 border-t border-border">
                    <div className="flex items-center gap-2">
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={Power}
                            onClick={() => setAllEnabled(true)}
                            disabled={controlsDisabled || allEnabled}
                            isLoading={pending === '__enable_all__'}
                        >
                            Enable all
                        </Button>
                        <Button
                            variant="secondary"
                            size="sm"
                            icon={PowerOff}
                            onClick={() => setAllEnabled(false)}
                            disabled={controlsDisabled || enabledCount === 0}
                            isLoading={pending === '__disable_all__'}
                        >
                            Disable all
                        </Button>
                    </div>
                    {pending === '__reorder__' && (
                        <span className="text-xs text-accent inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Reordering
                        </span>
                    )}
                    <Button variant="secondary" size="sm" onClick={onClose}>
                        Done
                    </Button>
                </div>
            </div>
        </div>
    );
}
