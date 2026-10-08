import type { RouteObject } from 'react-router';
import { GuestOnly, RequireAuth, SessionRoot } from '../features/auth/guards';
import { RequireChild, RequireNoChild } from '../features/child/guards';
import { ForgotPasswordPage } from '../pages/auth/ForgotPasswordPage';
import { LoginPage } from '../pages/auth/LoginPage';
import { RegisterPage } from '../pages/auth/RegisterPage';
import { ResetPasswordPage } from '../pages/auth/ResetPasswordPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { OnboardingPage } from '../pages/onboarding/OnboardingPage';
import { AccountPage } from '../pages/AccountPage';
import { AgeSettingsPage } from '../pages/AgeSettingsPage';
import { CustomDishPage } from '../pages/CustomDishPage';
import { DayDetailPage } from '../pages/DayDetailPage';
import { DishesPage } from '../pages/DishesPage';
import { ErrorPage } from '../pages/ErrorPage';
import { HealthPage } from '../pages/HealthPage';
import { InvitePage } from '../pages/InvitePage';
import { JournalPage } from '../pages/JournalPage';
import { LogPage } from '../pages/LogPage';
import { ProfilePage } from '../pages/ProfilePage';
import { PrivacyPage } from '../pages/PrivacyPage';
import { RecipePage } from '../pages/RecipePage';
import { StatusPage } from '../pages/StatusPage';
import { SwapPage } from '../pages/SwapPage';
import { TodayPage } from '../pages/TodayPage';
import { UrgentPage } from '../pages/UrgentPage';
import { WeekPage } from '../pages/WeekPage';
import { AppShell, BareShell, PlainShell } from './layouts';

export const routes: RouteObject[] = [
  {
    element: <SessionRoot />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <PlainShell />,
        children: [
          { path: '/privacy', element: <PrivacyPage /> },
          { path: '/status', element: <StatusPage /> },
          { path: '/reset-password', element: <ResetPasswordPage /> },
          // Open to anyone holding the link; joining asks to sign in first (UC-21).
          { path: '/invite/:token', element: <InvitePage /> },
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
                  { path: '/meals/:mealId/swap', element: <SwapPage /> },
                  { path: '/meals/:mealId/log', element: <LogPage /> },
                  { path: '/dishes/new', element: <CustomDishPage /> },
                  { path: '/dishes/:dishId/edit', element: <CustomDishPage /> },
                  { path: '/health', element: <HealthPage /> },
                  { path: '/week/:date', element: <DayDetailPage /> },
                ],
              },
              {
                element: <BareShell />,
                children: [
                  { path: '/dishes/:dishId', element: <RecipePage /> },
                  { path: '/urgent', element: <UrgentPage /> },
                ],
              },
              {
                element: <AppShell />,
                children: [
                  { path: '/', element: <TodayPage /> },
                  { path: '/week', element: <WeekPage /> },
                  { path: '/dishes', element: <DishesPage /> },
                  { path: '/journal', element: <JournalPage /> },
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
