import { describe, it, expect, vi, beforeEach } from "vitest";
import { mondayQuery } from "@/lib/sales/monday-client";
import { lijstAlleBoards, haalBoardStructuur, zoekItemMetBoard, MAX_BOARDS, MAX_ITEMS_PER_BOARD, MAX_SUBITEMS_PER_ITEM } from "./monday-readonly";

vi.mock("@/lib/sales/monday-client", async (importOriginal) => {
  const echt = await importOriginal<typeof import("@/lib/sales/monday-client")>();
  return { ...echt, mondayQuery: vi.fn() };
});

const mockQuery = vi.mocked(mondayQuery);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("lijstAlleBoards — read-only board-discovery", () => {
  it("geeft de boardlijst van Monday onbewerkt terug", async () => {
    mockQuery.mockResolvedValue({ boards: [{ id: "1", name: "1: Scholen (Master Data)", items_count: 42, state: "active" }] });

    const boards = await lijstAlleBoards();

    expect(boards).toEqual([{ id: "1", name: "1: Scholen (Master Data)", items_count: 42, state: "active" }]);
  });

  it("begrenst een te grote limiet naar MAX_BOARDS", async () => {
    mockQuery.mockResolvedValue({ boards: [] });

    await lijstAlleBoards(9999);

    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), { limit: MAX_BOARDS });
  });

  it("geeft nooit een mutatie-aanroep door — uitsluitend de query-string wordt gecontroleerd op 'query', nooit 'mutation'", async () => {
    mockQuery.mockResolvedValue({ boards: [] });
    await lijstAlleBoards();
    const query = mockQuery.mock.calls[0]![0] as string;
    expect(query.trim().startsWith("query")).toBe(true);
  });
});

describe("haalBoardStructuur — read-only boardverkenning (groepen/kolommen/items/subitems)", () => {
  it("zet de ruwe Monday-respons om naar de platte structuur, inclusief subitems", async () => {
    mockQuery.mockResolvedValue({
      boards: [
        {
          id: "999",
          name: "Trainer Wessel Kok",
          groups: [{ id: "grp1", title: "IKC Borgmanschool Oosterpark" }],
          columns: [
            { id: "board_relation_abc", title: "Master ID", type: "board_relation" },
            { id: "date_xyz", title: "Datum gepland", type: "date" },
            { id: "status_qqq", title: "Status", type: "status" },
          ],
          items_page: {
            cursor: null,
            items: [
              {
                id: "item1",
                name: "Praktijktraining — Groepen & Leerdoelen",
                group: { id: "grp1", title: "IKC Borgmanschool Oosterpark" },
                column_values: [{ id: "status_qqq", text: "Gepland", value: '{"label":"Gepland"}' }],
                subitems: [
                  { id: "sub1", name: "Sessie 1", column_values: [{ id: "date_xyz", text: "2026-08-20", value: "{}" }] },
                ],
              },
            ],
          },
        },
      ],
    });

    const structuur = await haalBoardStructuur("999");

    expect(structuur).toEqual({
      id: "999",
      name: "Trainer Wessel Kok",
      groups: [{ id: "grp1", title: "IKC Borgmanschool Oosterpark" }],
      columns: [
        { id: "board_relation_abc", title: "Master ID", type: "board_relation" },
        { id: "date_xyz", title: "Datum gepland", type: "date" },
        { id: "status_qqq", title: "Status", type: "status" },
      ],
      items: [
        {
          id: "item1",
          name: "Praktijktraining — Groepen & Leerdoelen",
          groupId: "grp1",
          groupTitle: "IKC Borgmanschool Oosterpark",
          columnValues: [{ id: "status_qqq", text: "Gepland", value: '{"label":"Gepland"}' }],
          subitems: [{ id: "sub1", name: "Sessie 1", columnValues: [{ id: "date_xyz", text: "2026-08-20", value: "{}" }] }],
        },
      ],
      meerItemsBeschikbaar: false,
    });
  });

  it("geeft null terug wanneer het board niet bestaat of niet bereikbaar is met dit token — geen crash", async () => {
    mockQuery.mockResolvedValue({ boards: [] });
    expect(await haalBoardStructuur("onbestaand")).toBeNull();
  });

  it("meerItemsBeschikbaar is true zodra Monday een cursor teruggeeft (meer dan de opgehaalde pagina)", async () => {
    mockQuery.mockResolvedValue({
      boards: [{ id: "1", name: "x", groups: [], columns: [], items_page: { cursor: "verder", items: [] } }],
    });
    const structuur = await haalBoardStructuur("1");
    expect(structuur!.meerItemsBeschikbaar).toBe(true);
  });

  it("begrenst een te grote itemsLimit naar MAX_ITEMS_PER_BOARD", async () => {
    mockQuery.mockResolvedValue({ boards: [{ id: "1", name: "x", groups: [], columns: [], items_page: { cursor: null, items: [] } }] });
    await haalBoardStructuur("1", 9999);
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), { boardId: "1", itemsLimit: MAX_ITEMS_PER_BOARD });
  });

  it("begrenst het aantal teruggegeven subitems per item defensief tot MAX_SUBITEMS_PER_ITEM", async () => {
    const veelSubitems = Array.from({ length: MAX_SUBITEMS_PER_ITEM + 10 }, (_, i) => ({ id: `sub${i}`, name: `Sessie ${i}`, column_values: [] }));
    mockQuery.mockResolvedValue({
      boards: [
        {
          id: "1",
          name: "x",
          groups: [],
          columns: [],
          items_page: { cursor: null, items: [{ id: "item1", name: "item", group: null, column_values: [], subitems: veelSubitems }] },
        },
      ],
    });
    const structuur = await haalBoardStructuur("1");
    expect(structuur!.items[0]!.subitems).toHaveLength(MAX_SUBITEMS_PER_ITEM);
  });
});

describe("zoekItemMetBoard — herleidt een item-ID naar zijn board (voor board_relation-koppelingen)", () => {
  it("geeft board-ID en -naam terug voor een bestaand item", async () => {
    mockQuery.mockResolvedValue({ items: [{ id: "123", name: "Jeroen Bakker", board: { id: "18420999", name: "8: Contactpersonen" } }] });

    const resultaat = await zoekItemMetBoard("123");

    expect(resultaat).toEqual({ id: "123", name: "Jeroen Bakker", board: { id: "18420999", name: "8: Contactpersonen" } });
  });

  it("geeft null terug voor een onbestaand item — geen crash", async () => {
    mockQuery.mockResolvedValue({ items: [] });
    expect(await zoekItemMetBoard("onbestaand")).toBeNull();
  });
});
