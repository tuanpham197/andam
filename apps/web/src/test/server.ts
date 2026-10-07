import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { STAGES, childFixture, dayFixture, libraryFixture } from './fixtures';

/** Defaults every test gets: a signed-in user already has bé Na, with today's plan ready. */
export const server = setupServer(
  http.get('*/api/v1/children', () => HttpResponse.json([childFixture()])),
  http.get('*/api/v1/stages', () => HttpResponse.json(STAGES)),
  http.get('*/api/v1/children/:childId/days/:date', ({ params }) =>
    HttpResponse.json(dayFixture({ date: params.date as string })),
  ),
  http.get('*/api/v1/children/:childId/dishes', () => HttpResponse.json(libraryFixture())),
);
