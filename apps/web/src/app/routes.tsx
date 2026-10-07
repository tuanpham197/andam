import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth, SessionRoot } from '../features/auth/guards';
import { RequireChild, RequireNoChild } from '../features/child/guards';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OnboardingPage } from '../pages/onboarding/OnboardingPage';
import { Placeholder } from '../pages/placeholders/Placeholder';
import { AccountPage } from '../pages/AccountPage';
import { AgeSettingsPage } from '../pages/AgeSettingsPage';
import { DishesPage } from '../pages/DishesPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PrivacyPage } from '../pages/PrivacyPage';
import { RecipePage } from '../pages/RecipePage';
import { StatusPage } from '../pages/StatusPage';
import { SwapPage } from '../pages/SwapPage';
import { TodayPage } from '../pages/TodayPage';
import { vi } from '../strings/vi';
import { AppShell, BareShell, PlainShell } from './layouts';

export const routes: RouteObject[] = [
  {
    element: <SessionRoot />,
    children: [
      {
        element: <PlainShell />,
        children: [
          { path: '/privacy', element: <PrivacyPage /> },
          { path: '/status', element: <StatusPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
          {
            element: <GuestOnly />,
            children: [
              { path: '/login', element: <LoginPage /> },
              { path: '/register', element: <RegisterPage /> },
              { path: '/forgot-password', element: <ForgotPasswordPage /> },
            ],
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <RequireNoChild />,
            children: [
              {
                element: <PlainShell />,
                children: [{ path: '/onboarding/:step', element: <OnboardingPage /> }],
              },
            ],
          },
          {
            element: <RequireChild />,
            children: [
              {
                element: <PlainShell />,
                children: [
                  { path: '/settings/age', element: <AgeSettingsPage /> },
                  // Log (P5) and health (P6) are placeholders until their phase; S01 already links to them.
                  { path: '/meals/:mealId/swap', element: <SwapPage /> },
                  {
                    path: '/meals/:mealId/log',
                    element: <Placeholder title={vi.placeholders.log} back="/" />,
                  },
                  {
                    path: '/health',
                    element: <Placeholder title={vi.placeholders.health} back="/" />,
                  },
                ],
              },
              {
                element: <BareShell />,
                children: [{ path: '/dishes/:dishId', element: <RecipePage /> }],
              },
              {
                element: <AppShell />,
                children: [
                  { path: '/', element: <TodayPage /> },
                  { path: '/week', element: <Placeholder title={vi.placeholders.week} /> },
                  { path: '/dishes', element: <DishesPage /> },
                  { path: '/journal', element: <Placeholder title={vi.placeholders.journal} /> },
                  { path: '/profile', element: <ProfilePage /> },
                  { path: '/account', element: <AccountPage /> },
                  { path: '*', element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];
