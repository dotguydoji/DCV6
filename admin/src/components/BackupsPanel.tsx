import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Archive, Loader2, RotateCcw } from 'lucide-react';
import { ApiError, getBackupStatus, restoreLatestBackup } from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { PasswordGateDialog } from './PasswordGateDialog';
import { InfoDialog } from './InfoDialog';
import { getAdminCid } from '../lib/cid';

interface BackupsPanelProps {
  idToken: string;
}

/**
 * Every buyer record is backed up automatically once a day (see
 * scheduled-backup-buyers.ts) to a private Cloudflare R2 location that has
 * no public URL and is never exposed through any endpoint - not even to a
 * signed-in admin. This panel can only ever show a count/timestamp (from
 * the backup's own metadata, not its contents) and trigger a restore -
 * nobody can read what's actually inside a backup file from here.
 */
export const BackupsPanel: React.FC<BackupsPanelProps> = ({ idToken }) => {
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [backupCount, setBackupCount] = useState<number | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [showCidGate, setShowCidGate] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoreSuccessMessage, setRestoreSuccessMessage] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setStatusLoading(true);
    setStatusError(null);
    try {
      const result = await getBackupStatus(idToken);
      setLastBackupAt(result.lastBackupAt);
      setBackupCount(result.count);
    } catch (err) {
      setStatusError(err instanceof ApiError ? err.message : 'Could not check backup status.');
    } finally {
      setStatusLoading(false);
    }
  }, [idToken]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const performRestore = useCallback(async () => {
    setIsRestoring(true);
    setRestoreError(null);
    try {
      const result = await restoreLatestBackup(idToken);
      setRestoreSuccessMessage(
        `Restored ${result.restoredCount} buyer${result.restoredCount === 1 ? '' : 's'} from the backup created ${new Date(
          result.backupCreatedAt
        ).toLocaleString()}.`
      );
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setIsRestoring(false);
    }
  }, [idToken]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Backups</h1>
        <p className="text-sm text-brand-muted mt-1">Automatic daily backup and one-click restore for buyer access.</p>
      </div>

      <div className="mb-6 bg-brand-surface border border-brand-border rounded-xl p-5">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <Archive size={18} className="text-brand-yellow" />
          Backup status
        </h2>
        {statusLoading ? (
          <p className="flex items-center gap-2 text-sm text-brand-muted">
            <Loader2 size={14} className="animate-spin" />
            Checking…
          </p>
        ) : statusError ? (
          <p className="flex items-center gap-1.5 text-red-400 text-sm">
            <AlertCircle size={14} className="shrink-0" />
            {statusError}
          </p>
        ) : lastBackupAt ? (
          <p className="text-sm text-brand-muted">
            Last backup: <span className="text-white font-medium">{new Date(lastBackupAt).toLocaleString()}</span> ·{' '}
            {backupCount ?? '?'} buyer{backupCount === 1 ? '' : 's'}
          </p>
        ) : (
          <p className="text-sm text-brand-muted">
            No backup yet - the first automatic backup runs at midnight UTC.
          </p>
        )}
        <p className="text-xs text-brand-muted mt-3">
          Backups run automatically once a day and are stored privately - their contents can't be viewed from here or
          anywhere else, only restored.
        </p>
      </div>

      <div className="bg-brand-surface border border-brand-border rounded-xl p-5">
        <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
          <RotateCcw size={18} className="text-brand-yellow" />
          Restore from latest backup
        </h2>
        <p className="text-sm text-brand-muted mb-4">
          Use this only if buyer access data was lost or corrupted. It restores every buyer from the most recent
          backup. It will never delete a buyer who exists right now, even if they aren't in that backup.
        </p>
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={isRestoring || !lastBackupAt}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-yellow text-brand-black font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-95 transition-[filter]"
        >
          {isRestoring ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
          {isRestoring ? 'Restoring…' : 'Restore from latest backup'}
        </button>
        {restoreError && (
          <p className="flex items-center gap-1.5 text-red-400 text-sm mt-3">
            <AlertCircle size={14} className="shrink-0" />
            {restoreError}
          </p>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Restore buyer access?"
        message="This restores every buyer's access from the most recent backup, overwriting their current record with the backed-up version. Buyers not in that backup are left untouched - nothing is deleted. This cannot be undone."
        confirmLabel="Continue"
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => {
          setShowConfirm(false);
          setShowCidGate(true);
        }}
      />

      <PasswordGateDialog
        open={showCidGate}
        title="Enter CID to continue"
        message="Restoring from backup is a sensitive action. Enter the CID to proceed."
        password={getAdminCid()}
        onCancel={() => setShowCidGate(false)}
        onVerified={() => {
          setShowCidGate(false);
          performRestore();
        }}
      />

      <InfoDialog
        open={restoreSuccessMessage !== null}
        title="Restore complete"
        message={restoreSuccessMessage ?? ''}
        onClose={() => {
          setRestoreSuccessMessage(null);
          loadStatus();
        }}
      />
    </div>
  );
};
