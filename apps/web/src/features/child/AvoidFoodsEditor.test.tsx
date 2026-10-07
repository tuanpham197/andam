import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { API } from '../../test/api';
import { renderWithQuery } from '../../test/render';
import { server } from '../../test/server';
import type { DraftIngredient } from '../onboarding/draft';
import { AvoidFoodsEditor } from './AvoidFoodsEditor';

function Harness({ initial = [] as DraftIngredient[] }) {
  const [allergens, setAllergens] = useState<string[]>(['egg']);
  const [ingredients, setIngredients] = useState(initial);
  return (
    <>
      <AvoidFoodsEditor
        allergens={allergens as never}
        ingredients={ingredients}
        onAllergensChange={setAllergens as never}
        onIngredientsChange={setIngredients}
      />
      <output data-testid="state">{JSON.stringify({ allergens, ingredients })}</output>
    </>
  );
}

const state = () => JSON.parse(screen.getByTestId('state').textContent!);

function searchReturns(results: { id: string; name: string }[]) {
  const calls: string[] = [];
  server.use(
    http.get(`${API}/ingredients`, ({ request }) => {
      calls.push(new URL(request.url).searchParams.get('q')!);
      return HttpResponse.json(
        results.map((r) => ({ ...r, foodGroup: 'veg', proteinSource: null, allergenTags: [] })),
      );
    }),
  );
  return () => calls;
}

describe('AvoidFoodsEditor (S06)', () => {
  it('lists the 9 common allergens as toggles, with the chosen ones pressed', async () => {
    renderWithQuery(<Harness />);
    const group = screen.getByRole('group', { name: 'Chất gây dị ứng thường gặp' });
    const chips = group.querySelectorAll('button');
    expect([...chips].map((c) => c.textContent)).toEqual([
      'Trứng',
      'Sữa bò',
      'Đậu phộng',
      'Tôm, cua',
      'Cá',
      'Lúa mì',
      'Đậu nành',
      'Mè',
      'Hạt cây',
    ]);
    expect(screen.getByRole('button', { name: 'Trứng' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Cá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Trứng' }));
    expect(state().allergens).toEqual(['fish']);
  });

  it('searches the catalog once typing pauses and adds a result as "dislike"', async () => {
    const calls = searchReturns([{ id: 'ing_ca_rot', name: 'Cà rốt' }]);
    renderWithQuery(<Harness />);
    await userEvent.type(
      screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      'ca rot',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm Cà rốt' }));
    expect(state().ingredients).toEqual([
      { ingredientId: 'ing_ca_rot', name: 'Cà rốt', reason: 'dislike' },
    ]);
    expect(screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích')).toHaveValue('');
    expect(calls()).not.toContain('c');
  });

  it('does not offer an ingredient that is already on the list', async () => {
    searchReturns([
      { id: 'ing_muop_dang', name: 'Mướp đắng' },
      { id: 'ing_muoi', name: 'Muối' },
    ]);
    renderWithQuery(
      <Harness
        initial={[{ ingredientId: 'ing_muop_dang', name: 'Mướp đắng', reason: 'dislike' }]}
      />,
    );
    await userEvent.type(
      screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      'mu',
    );
    expect(await screen.findByRole('button', { name: 'Thêm Muối' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm Mướp đắng' })).toBeNull();
  });

  it('does not claim "not found" when every result is already on the list', async () => {
    searchReturns([{ id: 'ing_muop_dang', name: 'Mướp đắng' }]);
    renderWithQuery(<Harness />);
    await userEvent.type(
      screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      'muop',
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Thêm Mướp đắng' }));
    await userEvent.type(
      screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      'muop',
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryByText('Không tìm thấy nguyên liệu phù hợp')).toBeNull();
    expect(screen.getByText('Mướp đắng đã có trong danh sách')).toBeInTheDocument();
  });

  it('hides the search feedback as soon as the field is cleared', async () => {
    searchReturns([]);
    renderWithQuery(<Harness />);
    const field = screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích');
    await userEvent.type(field, 'xyz');
    await screen.findByText('Không tìm thấy nguyên liệu phù hợp');
    await userEvent.clear(field);
    expect(screen.queryByText('Không tìm thấy nguyên liệu phù hợp')).toBeNull();
  });

  it('says so when nothing matches', async () => {
    searchReturns([]);
    renderWithQuery(<Harness />);
    await userEvent.type(
      screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      'xyz',
    );
    expect(await screen.findByText('Không tìm thấy nguyên liệu phù hợp')).toBeInTheDocument();
  });

  it('does not search for blank input', async () => {
    const calls = searchReturns([]);
    renderWithQuery(<Harness />);
    await userEvent.type(
      screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      '   ',
    );
    await new Promise((r) => setTimeout(r, 300));
    expect(calls()).toEqual([]);
  });

  it('TC-UI-013 explains a failed search', async () => {
    server.use(http.get(`${API}/ingredients`, () => HttpResponse.error()));
    renderWithQuery(<Harness />);
    await userEvent.type(
      screen.getByLabelText('Thực phẩm khác bé không ăn hoặc không thích'),
      'ca',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });

  it('shows added foods with their reason and removes them', async () => {
    renderWithQuery(
      <Harness
        initial={[
          { ingredientId: 'ing_muop_dang', name: 'Mướp đắng', reason: 'dislike' },
          { ingredientId: 'ing_tom', name: 'Tôm', reason: 'not_eat' },
        ]}
      />,
    );
    expect(screen.getByText('Mướp đắng · không thích')).toBeInTheDocument();
    expect(screen.getByText('Tôm · không ăn')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Bỏ Mướp đắng' }));
    await waitFor(() =>
      expect(state().ingredients).toEqual([
        { ingredientId: 'ing_tom', name: 'Tôm', reason: 'not_eat' },
      ]),
    );
  });

  it('switches the reason of an added food', async () => {
    renderWithQuery(
      <Harness initial={[{ ingredientId: 'ing_tom', name: 'Tôm', reason: 'dislike' }]} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Đổi lý do cho Tôm' }));
    expect(state().ingredients[0].reason).toBe('not_eat');
    await userEvent.click(screen.getByRole('button', { name: 'Đổi lý do cho Tôm' }));
    expect(state().ingredients[0].reason).toBe('dislike');
  });
});
