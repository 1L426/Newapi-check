export default function ConfirmModal({
  title,
  message,
  confirmText = '确认',
  cancelText = '取消',
  onConfirm,
  onCancel,
  danger = false
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm">
      <div className="glass-panel p-6 w-full max-w-sm space-y-4 mx-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="glass-button flex-1">{cancelText}</button>
          <button
            onClick={onConfirm}
            className={`flex-1 ${danger ? 'glass-button-danger' : 'glass-button-primary'}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
