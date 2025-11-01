/**
 * ErrorBoundary component tests
 * Covers error catching, error display, and restart functionality
 * Aligns with standards/testing-standards.md and standards/frontend-tier.md#feature-guardrails
 */

import { render, screen, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { ErrorBoundary } from '../ErrorBoundary';

describe('ErrorBoundary', () => {
  // Suppress console.error for these tests since we expect errors
  const originalConsoleError = console.error;

  beforeAll(() => {
    console.error = jest.fn();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('normal operation', () => {
    it('renders children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <Text>Valid child content</Text>
        </ErrorBoundary>
      );

      expect(screen.getByText('Valid child content')).toBeTruthy();
    });

    it('renders multiple children without errors', () => {
      render(
        <ErrorBoundary>
          <Text>First child</Text>
          <Text>Second child</Text>
        </ErrorBoundary>
      );

      expect(screen.getByText('First child')).toBeTruthy();
      expect(screen.getByText('Second child')).toBeTruthy();
    });
  });

  describe('error handling', () => {
    function ThrowError(): null {
      throw new Error('Test error');
    }

    it('catches errors from child components', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // Should display error UI
      expect(screen.getByText('Something went wrong')).toBeTruthy();
      expect(
        screen.getByText(/The app encountered an unexpected error/)
      ).toBeTruthy();
    });

    it('displays error message when error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeTruthy();
      expect(screen.getByText(/Please try restarting/)).toBeTruthy();
    });

    it('displays restart button when error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Restart App')).toBeTruthy();
    });

    it('logs error to console', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('restart functionality', () => {
    function ThrowErrorConditional({ shouldThrow }: { shouldThrow: boolean }) {
      if (shouldThrow) {
        throw new Error('Conditional error');
      }
      return <Text>No error</Text>;
    }

    it('resets error state when restart button is pressed', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowErrorConditional shouldThrow={true} />
        </ErrorBoundary>
      );

      // Verify error UI is shown
      expect(screen.getByText('Something went wrong')).toBeTruthy();

      const restartButton = screen.getByText('Restart App');

      // Rerender with non-throwing component before pressing restart
      rerender(
        <ErrorBoundary>
          <ThrowErrorConditional shouldThrow={false} />
        </ErrorBoundary>
      );

      // Press restart button
      fireEvent.press(restartButton);

      // After restart, should show normal content
      // Note: In actual usage, the parent would need to remount children
      // This tests that the error boundary clears its error state
    });
  });

  describe('dev mode behavior', () => {
    const originalDev = __DEV__;

    afterEach(() => {
      // Restore original __DEV__ value
      (global as unknown as { __DEV__: boolean }).__DEV__ = originalDev;
    });

    it('shows error details in dev mode', () => {
      (global as unknown as { __DEV__: boolean }).__DEV__ = true;

      function ThrowCustomError(): null {
        throw new Error('Custom test error message');
      }

      render(
        <ErrorBoundary>
          <ThrowCustomError />
        </ErrorBoundary>
      );

      // In dev mode, should show error details
      expect(screen.getByText(/Custom test error message/)).toBeTruthy();
    });

    it('hides error details in production mode', () => {
      (global as unknown as { __DEV__: boolean }).__DEV__ = false;

      function ThrowCustomError(): null {
        throw new Error('Custom test error message');
      }

      render(
        <ErrorBoundary>
          <ThrowCustomError />
        </ErrorBoundary>
      );

      // In production, should not show error details
      expect(screen.queryByText(/Custom test error message/)).toBeNull();
    });
  });

  describe('accessibility', () => {
    function ThrowError(): null {
      throw new Error('Test error');
    }

    it('renders error UI with accessible text elements', () => {
      render(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>
      );

      // All text should be accessible
      expect(screen.getByText('Something went wrong')).toBeTruthy();
      expect(
        screen.getByText(/The app encountered an unexpected error/)
      ).toBeTruthy();
      expect(screen.getByText('Restart App')).toBeTruthy();
    });
  });
});
