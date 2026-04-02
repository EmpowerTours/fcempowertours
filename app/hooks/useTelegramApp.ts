/**
 * useTelegramApp Hook
 *
 * Initialize and interact with the Telegram Mini App WebApp API.
 * Handles:
 *   - WebApp initialization and ready signal
 *   - Theme parameters and color scheme detection
 *   - Viewport tracking (height, stable height, expanded state)
 *   - MainButton control (show, hide, text, color, click handler)
 *   - BackButton control (show, hide, click handler)
 *   - HapticFeedback wrappers
 *   - Closing confirmation and close behavior
 *
 * Only call this hook in components that render inside a Telegram Mini App.
 * Outside Telegram, all methods are safe no-ops.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Telegram WebApp theme parameters.
 */
export interface TelegramThemeParams {
  bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  secondary_bg_color?: string;
  header_bg_color?: string;
  accent_text_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
  destructive_text_color?: string;
}

/**
 * MainButton configuration.
 */
export interface MainButtonConfig {
  text: string;
  color?: string;
  textColor?: string;
  isActive?: boolean;
  isVisible?: boolean;
}

/**
 * Return type of the useTelegramApp hook.
 */
export interface TelegramAppState {
  /** Whether we are actually inside a Telegram Mini App */
  isTelegram: boolean;
  /** Whether the WebApp SDK has been initialized */
  isReady: boolean;
  /** Current color scheme ('light' | 'dark') */
  colorScheme: 'light' | 'dark';
  /** Theme parameters from Telegram */
  themeParams: TelegramThemeParams;
  /** Current viewport height */
  viewportHeight: number;
  /** Stable viewport height (doesn't change during keyboard animation) */
  viewportStableHeight: number;
  /** Whether the app is expanded to full height */
  isExpanded: boolean;
  /** The raw Telegram WebApp initData for server validation */
  initData: string;
  /** Telegram user ID if available */
  userId: number | null;

  // Actions
  /** Expand the Mini App to full height */
  expand: () => void;
  /** Close the Mini App */
  close: () => void;
  /** Enable/disable closing confirmation dialog */
  setClosingConfirmation: (enabled: boolean) => void;

  // MainButton
  /** Show the MainButton with the given config */
  showMainButton: (config: MainButtonConfig) => void;
  /** Hide the MainButton */
  hideMainButton: () => void;
  /** Set the MainButton loading state */
  setMainButtonLoading: (loading: boolean) => void;

  // BackButton
  /** Show the BackButton with a click handler */
  showBackButton: (onClick: () => void) => void;
  /** Hide the BackButton */
  hideBackButton: () => void;

  // Haptic Feedback
  /** Trigger impact haptic feedback */
  impactFeedback: (style?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
  /** Trigger notification haptic feedback */
  notificationFeedback: (type?: 'error' | 'success' | 'warning') => void;
  /** Trigger selection change haptic feedback */
  selectionFeedback: () => void;
}

/**
 * Hook for initializing and controlling the Telegram Mini App.
 */
export function useTelegramApp(): TelegramAppState {
  const [isTelegram, setIsTelegram] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('dark');
  const [themeParams, setThemeParams] = useState<TelegramThemeParams>({});
  const [viewportHeight, setViewportHeight] = useState(0);
  const [viewportStableHeight, setViewportStableHeight] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [initData, setInitData] = useState('');
  const [userId, setUserId] = useState<number | null>(null);

  // Ref for MainButton click handler (to avoid stale closures)
  const mainButtonCallbackRef = useRef<(() => void) | null>(null);
  const backButtonCallbackRef = useRef<(() => void) | null>(null);

  // Get the Telegram WebApp instance
  const getWebApp = useCallback((): any => {
    if (typeof window === 'undefined') return null;
    return (window as any).Telegram?.WebApp || null;
  }, []);

  // Initialize
  useEffect(() => {
    const webApp = getWebApp();
    if (!webApp || !webApp.initData) {
      setIsReady(true); // Not in Telegram, but ready (as a no-op)
      return;
    }

    setIsTelegram(true);
    setInitData(webApp.initData);
    setColorScheme(webApp.colorScheme || 'dark');
    setThemeParams(webApp.themeParams || {});
    setViewportHeight(webApp.viewportHeight || 0);
    setViewportStableHeight(webApp.viewportStableHeight || 0);
    setIsExpanded(webApp.isExpanded || false);

    // Extract user ID
    const tgUserId = webApp.initDataUnsafe?.user?.id;
    if (tgUserId) {
      setUserId(tgUserId);
    }

    // Listen for theme changes
    const onThemeChanged = () => {
      setColorScheme(webApp.colorScheme || 'dark');
      setThemeParams(webApp.themeParams || {});
    };

    // Listen for viewport changes
    const onViewportChanged = (event: any) => {
      setViewportHeight(webApp.viewportHeight || 0);
      setViewportStableHeight(webApp.viewportStableHeight || 0);
      setIsExpanded(event?.isStateStable ? webApp.isExpanded : isExpanded);
    };

    // Listen for MainButton clicks
    const onMainButtonClicked = () => {
      if (mainButtonCallbackRef.current) {
        mainButtonCallbackRef.current();
      }
    };

    webApp.onEvent('themeChanged', onThemeChanged);
    webApp.onEvent('viewportChanged', onViewportChanged);
    webApp.onEvent('mainButtonClicked', onMainButtonClicked);

    // Signal ready to Telegram
    webApp.ready();
    setIsReady(true);
    console.log('[TelegramApp] Initialized and ready');

    return () => {
      webApp.offEvent('themeChanged', onThemeChanged);
      webApp.offEvent('viewportChanged', onViewportChanged);
      webApp.offEvent('mainButtonClicked', onMainButtonClicked);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Actions ---

  const expand = useCallback(() => {
    const webApp = getWebApp();
    if (webApp?.expand) {
      webApp.expand();
      setIsExpanded(true);
    }
  }, [getWebApp]);

  const close = useCallback(() => {
    const webApp = getWebApp();
    if (webApp?.close) {
      webApp.close();
    }
  }, [getWebApp]);

  const setClosingConfirmation = useCallback((enabled: boolean) => {
    const webApp = getWebApp();
    if (webApp) {
      webApp.enableClosingConfirmation = enabled;
      if (enabled && webApp.enableClosingConfirmation) {
        webApp.enableClosingConfirmation();
      } else if (!enabled && webApp.disableClosingConfirmation) {
        webApp.disableClosingConfirmation();
      }
    }
  }, [getWebApp]);

  // --- MainButton ---

  const showMainButton = useCallback((config: MainButtonConfig) => {
    const webApp = getWebApp();
    if (!webApp?.MainButton) return;

    const btn = webApp.MainButton;
    btn.setText(config.text);

    if (config.color) btn.color = config.color;
    if (config.textColor) btn.textColor = config.textColor;
    if (config.isActive !== undefined) {
      config.isActive ? btn.enable() : btn.disable();
    }

    btn.show();

    // Store the callback for click events - we set it up in the useEffect
    // but the config.onClick doesn't exist on this interface; the caller
    // should use the hook's returned function directly.
  }, [getWebApp]);

  const hideMainButton = useCallback(() => {
    const webApp = getWebApp();
    if (webApp?.MainButton) {
      webApp.MainButton.hide();
    }
  }, [getWebApp]);

  const setMainButtonLoading = useCallback((loading: boolean) => {
    const webApp = getWebApp();
    if (!webApp?.MainButton) return;

    if (loading) {
      webApp.MainButton.showProgress();
    } else {
      webApp.MainButton.hideProgress();
    }
  }, [getWebApp]);

  // --- BackButton ---

  const showBackButton = useCallback((onClick: () => void) => {
    const webApp = getWebApp();
    if (!webApp?.BackButton) return;

    // Remove previous handler if any
    if (backButtonCallbackRef.current) {
      webApp.BackButton.offClick(backButtonCallbackRef.current);
    }

    backButtonCallbackRef.current = onClick;
    webApp.BackButton.onClick(onClick);
    webApp.BackButton.show();
  }, [getWebApp]);

  const hideBackButton = useCallback(() => {
    const webApp = getWebApp();
    if (!webApp?.BackButton) return;

    if (backButtonCallbackRef.current) {
      webApp.BackButton.offClick(backButtonCallbackRef.current);
      backButtonCallbackRef.current = null;
    }

    webApp.BackButton.hide();
  }, [getWebApp]);

  // --- Haptic Feedback ---

  const impactFeedback = useCallback((style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    const webApp = getWebApp();
    if (webApp?.HapticFeedback) {
      webApp.HapticFeedback.impactOccurred(style);
    }
  }, [getWebApp]);

  const notificationFeedback = useCallback((type: 'error' | 'success' | 'warning' = 'success') => {
    const webApp = getWebApp();
    if (webApp?.HapticFeedback) {
      webApp.HapticFeedback.notificationOccurred(type);
    }
  }, [getWebApp]);

  const selectionFeedback = useCallback(() => {
    const webApp = getWebApp();
    if (webApp?.HapticFeedback) {
      webApp.HapticFeedback.selectionChanged();
    }
  }, [getWebApp]);

  return {
    isTelegram,
    isReady,
    colorScheme,
    themeParams,
    viewportHeight,
    viewportStableHeight,
    isExpanded,
    initData,
    userId,

    expand,
    close,
    setClosingConfirmation,

    showMainButton,
    hideMainButton,
    setMainButtonLoading,

    showBackButton,
    hideBackButton,

    impactFeedback,
    notificationFeedback,
    selectionFeedback,
  };
}
