import React from 'react';

export const SkipLinks: React.FC = () => {
  return (
    <nav aria-label="Skip navigation links" className="fixed top-0 left-0 z-50">
      <div className="flex flex-col gap-2">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:p-3 focus:bg-yellow-400 focus:text-black focus:font-black focus:text-base focus:border-2 focus:border-black focus:rounded-lg focus:shadow-2xl focus:outline-none focus:ring-4 focus:ring-amber-500"
        >
          Skip to Main Content
        </a>
        <a
          href="#main-question-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-14 focus:left-3 focus:z-50 focus:p-3 focus:bg-yellow-400 focus:text-black focus:font-black focus:text-base focus:border-2 focus:border-black focus:rounded-lg focus:shadow-2xl focus:outline-none focus:ring-4 focus:ring-amber-500"
        >
          Skip to Question Content
        </a>
        <a
          href="#answer-options-group"
          className="sr-only focus:not-sr-only focus:fixed focus:top-16 focus:left-3 focus:z-50 focus:p-3 focus:bg-yellow-400 focus:text-black focus:font-black focus:text-base focus:border-2 focus:border-black focus:rounded-lg focus:shadow-2xl focus:outline-none focus:ring-4 focus:ring-amber-500"
        >
          Skip to Answer Options
        </a>
        <a
          href="#question-navigation-controls"
          className="sr-only focus:not-sr-only focus:fixed focus:top-28 focus:left-3 focus:z-50 focus:p-3 focus:bg-yellow-400 focus:text-black focus:font-black focus:text-base focus:border-2 focus:border-black focus:rounded-lg focus:shadow-2xl focus:outline-none focus:ring-4 focus:ring-amber-500"
        >
          Skip to Navigation Controls
        </a>
        <a
          href="#btn-a11y-settings"
          className="sr-only focus:not-sr-only focus:fixed focus:top-40 focus:left-3 focus:z-50 focus:p-3 focus:bg-yellow-400 focus:text-black focus:font-black focus:text-base focus:border-2 focus:border-black focus:rounded-lg focus:shadow-2xl focus:outline-none focus:ring-4 focus:ring-amber-500"
        >
          Skip to Accessibility Settings
        </a>
      </div>
    </nav>
  );
};
