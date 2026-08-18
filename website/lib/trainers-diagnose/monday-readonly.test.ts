import { describe, it, expect, vi, beforeEach } from "vitest";
import { mondayQuery } from "@/lib/sales/monday-client";
import { lijstAlleBoards, haalBoardStructuur, haalItemDetail, analyseerBoardRelaties, MAX_BOARDS, MAX_ITEMS_PER_BOARD, MAX_SUBITEMS_PER_ITEM, MAX_RELATED_BOARDS } from "./monday-readonly";

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

describe("haalItemDetail — volledig itemdetail (groep/board/ALLE column_values, board_relation volledig zichtbaar)", () => {
  it("geeft item, groep, board én alle column_values (met title/type uit de geneste column-relatie) terug", async () => {
    mockQuery.mockResolvedValue({
      items: [
        {
          id: "12713002919",
          name: "Praktijktraining — Groepen & Leerdoelen",
          group: { id: "grp1", title: "IKC Borgmanschool Oosterpark" },
          board: { id: "999", name: "Trainer Wessel Kok" },
          column_values: [
            { id: "board_relation_abc", text: "IKC Borgmanschool Oosterpark", value: '{"linkedPulseIds":[{"linkedPulseId":18420555}]}', column: { title: "Master ID", type: "board_relation" } },
            { id: "date_xyz", text: "2026-08-20", value: '{"date":"2026-08-20"}', column: { title: "Datum gepland", type: "date" } },
            { id: "status_qqq", text: "Gepland", value: '{"index":1,"label":"Gepland"}', column: { title: "Status", type: "status" } },
          ],
        },
      ],
    });

    const detail = await haalItemDetail("12713002919");

    expect(detail).toEqual({
      id: "12713002919",
      name: "Praktijktraining — Groepen & Leerdoelen",
      group: { id: "grp1", title: "IKC Borgmanschool Oosterpark" },
      board: { id: "999", name: "Trainer Wessel Kok" },
      columnValues: [
        { id: "board_relation_abc", title: "Master ID", type: "board_relation", text: "IKC Borgmanschool Oosterpark", value: '{"linkedPulseIds":[{"linkedPulseId":18420555}]}' },
        { id: "date_xyz", title: "Datum gepland", type: "date", text: "2026-08-20", value: '{"date":"2026-08-20"}' },
        { id: "status_qqq", title: "Status", type: "status", text: "Gepland", value: '{"index":1,"label":"Gepland"}' },
      ],
    });
  });

  it("laat de ruwe board_relation-value volledig en ongewijzigd door — geen inkorting/parsing", async () => {
    const langeWaarde = JSON.stringify({ linkedPulseIds: [{ linkedPulseId: 18420555 }, { linkedPulseId: 18420556 }], changed_at: "2026-08-19T09:00:00.000Z" });
    mockQuery.mockResolvedValue({
      items: [
        { id: "1", name: "x", group: null, board: null, column_values: [{ id: "board_relation_abc", text: "twee gekoppelde items", value: langeWaarde, column: { title: "Master ID", type: "board_relation" } }] },
      ],
    });

    const detail = await haalItemDetail("1");

    expect(detail!.columnValues[0]!.value).toBe(langeWaarde);
  });

  it("valt terug op lege title/type wanneer de column-relatie ontbreekt — geen crash", async () => {
    mockQuery.mockResolvedValue({
      items: [{ id: "1", name: "x", group: null, board: null, column_values: [{ id: "onbekend", text: "iets", value: "{}", column: null }] }],
    });
    const detail = await haalItemDetail("1");
    expect(detail!.columnValues[0]).toEqual({ id: "onbekend", title: "", type: "", text: "iets", value: "{}" });
  });

  it("geeft null terug voor een onbestaand item — geen crash", async () => {
    mockQuery.mockResolvedValue({ items: [] });
    expect(await haalItemDetail("onbestaand")).toBeNull();
  });
});

describe("analyseerBoardRelaties — Connect Boards- en mirror-kolomanalyse", () => {
  it("herleidt een board_relation-kolom naar doelboard(en) + een afhankelijke mirror-kolom (unidirectioneel)", async () => {
    mockQuery
      .mockResolvedValueOnce({
        boards: [
          {
            id: "999",
            name: "Trainer Wessel Kok",
            columns: [
              { id: "rel_master", title: "Master ID", type: "board_relation", settings_str: '{"boardIds":[18420120365],"allowMultipleItems":false}' },
              { id: "mirror_schoolnaam", title: "Schoolnaam (mirror)", type: "mirror", settings_str: '{"relation_column":{"rel_master":true},"displayed_column":{"schoolnaam_col":true}}' },
              { id: "status_x", title: "Status", type: "status", settings_str: '{"labels":{"0":"Open"}}' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({
        boards: [
          {
            id: "18420120365",
            name: "1: Scholen (Master Data)",
            columns: [{ id: "schoolnaam_col", title: "Naam", type: "text", settings_str: null }],
          },
        ],
      });

    const analyse = await analyseerBoardRelaties("999");

    expect(analyse).toEqual({
      boardId: "999",
      boardName: "Trainer Wessel Kok",
      boardRelationKolommen: [
        {
          id: "rel_master",
          title: "Master ID",
          doelboards: [{ id: "18420120365", name: "1: Scholen (Master Data)" }],
          vermoedelijkBidirectioneel: false,
          afhankelijkeMirrorKolommen: [{ id: "mirror_schoolnaam", title: "Schoolnaam (mirror)" }],
          ruweSettings: '{"boardIds":[18420120365],"allowMultipleItems":false}',
        },
      ],
      mirrorKolommen: [
        {
          id: "mirror_schoolnaam",
          title: "Schoolnaam (mirror)",
          bronRelatieKolom: { id: "rel_master", title: "Master ID" },
          weergegevenKolomId: "schoolnaam_col",
          ruweSettings: '{"relation_column":{"rel_master":true},"displayed_column":{"schoolnaam_col":true}}',
        },
      ],
    });
    expect(mockQuery).toHaveBeenCalledTimes(2);
    expect(mockQuery.mock.calls[1]![1]).toEqual({ ids: ["18420120365"] });
  });

  it("vermoedelijkBidirectioneel: true wanneer het doelboard zélf een board_relation-kolom heeft die terugwijst", async () => {
    mockQuery
      .mockResolvedValueOnce({
        boards: [{ id: "1", name: "Board A", columns: [{ id: "rel_a", title: "Relatie", type: "board_relation", settings_str: '{"boardIds":[2]}' }] }],
      })
      .mockResolvedValueOnce({
        boards: [{ id: "2", name: "Board B", columns: [{ id: "rel_b", title: "Terug-relatie", type: "board_relation", settings_str: '{"boardIds":[1]}' }] }],
      });

    const analyse = await analyseerBoardRelaties("1");
    expect(analyse!.boardRelationKolommen[0]!.vermoedelijkBidirectioneel).toBe(true);
  });

  it("vermoedelijkBidirectioneel: false wanneer het doelboard geen terugwijzende board_relation-kolom heeft", async () => {
    mockQuery
      .mockResolvedValueOnce({
        boards: [{ id: "1", name: "Board A", columns: [{ id: "rel_a", title: "Relatie", type: "board_relation", settings_str: '{"boardIds":[2]}' }] }],
      })
      .mockResolvedValueOnce({
        boards: [{ id: "2", name: "Board B", columns: [{ id: "txt", title: "Tekst", type: "text", settings_str: null }] }],
      });

    const analyse = await analyseerBoardRelaties("1");
    expect(analyse!.boardRelationKolommen[0]!.vermoedelijkBidirectioneel).toBe(false);
  });

  it("herleidt meerdere doelboards binnen één board_relation-kolom", async () => {
    mockQuery
      .mockResolvedValueOnce({
        boards: [{ id: "1", name: "Board A", columns: [{ id: "rel_a", title: "Relatie", type: "board_relation", settings_str: '{"boardIds":[2,3]}' }] }],
      })
      .mockResolvedValueOnce({
        boards: [
          { id: "2", name: "Board B", columns: [] },
          { id: "3", name: "Board C", columns: [] },
        ],
      });

    const analyse = await analyseerBoardRelaties("1");
    expect(analyse!.boardRelationKolommen[0]!.doelboards).toEqual([
      { id: "2", name: "Board B" },
      { id: "3", name: "Board C" },
    ]);
  });

  it("dedupliceert doelboard-ID's die door meerdere relatiekolommen op hetzelfde board gedeeld worden", async () => {
    mockQuery
      .mockResolvedValueOnce({
        boards: [
          {
            id: "1",
            name: "Board A",
            columns: [
              { id: "rel_a", title: "Relatie A", type: "board_relation", settings_str: '{"boardIds":[5]}' },
              { id: "rel_b", title: "Relatie B", type: "board_relation", settings_str: '{"boardIds":[5]}' },
            ],
          },
        ],
      })
      .mockResolvedValueOnce({ boards: [{ id: "5", name: "Gedeeld doelboard", columns: [] }] });

    await analyseerBoardRelaties("1");
    expect(mockQuery.mock.calls[1]![1]).toEqual({ ids: ["5"] });
  });

  it("begrenst het aantal opgevraagde doelboarden tot MAX_RELATED_BOARDS", async () => {
    const veelKolommen = Array.from({ length: MAX_RELATED_BOARDS + 10 }, (_, i) => ({
      id: `rel_${i}`,
      title: `Relatie ${i}`,
      type: "board_relation",
      settings_str: `{"boardIds":[${i}]}`,
    }));
    mockQuery
      .mockResolvedValueOnce({ boards: [{ id: "1", name: "Board A", columns: veelKolommen }] })
      .mockResolvedValueOnce({ boards: [] });

    await analyseerBoardRelaties("1");
    const doorgegevenIds = mockQuery.mock.calls[1]![1] as { ids: string[] };
    expect(doorgegevenIds.ids).toHaveLength(MAX_RELATED_BOARDS);
  });

  it("valt terug op een lege doelboardlijst bij ontbrekende/kapotte settings_str — geen crash, geen extra Monday-aanroep", async () => {
    mockQuery.mockResolvedValueOnce({
      boards: [
        {
          id: "1",
          name: "Board A",
          columns: [
            { id: "rel_null", title: "Relatie zonder settings", type: "board_relation", settings_str: null },
            { id: "rel_kapot", title: "Relatie met kapotte JSON", type: "board_relation", settings_str: "niet-geldige-json{" },
          ],
        },
      ],
    });

    const analyse = await analyseerBoardRelaties("1");

    expect(analyse!.boardRelationKolommen[0]!.doelboards).toEqual([]);
    expect(analyse!.boardRelationKolommen[0]!.vermoedelijkBidirectioneel).toBe(false);
    expect(analyse!.boardRelationKolommen[1]!.ruweSettings).toBe("niet-geldige-json{");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("doet geen extra Monday-aanroep wanneer het board geen board_relation-kolommen heeft", async () => {
    mockQuery.mockResolvedValueOnce({
      boards: [{ id: "1", name: "Board A", columns: [{ id: "txt", title: "Tekst", type: "text", settings_str: null }] }],
    });

    const analyse = await analyseerBoardRelaties("1");

    expect(analyse!.boardRelationKolommen).toEqual([]);
    expect(analyse!.mirrorKolommen).toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("mirror-kolom met een relation_column-verwijzing naar een niet-bestaande kolom krijgt bronRelatieKolom: null — geen crash", async () => {
    mockQuery.mockResolvedValueOnce({
      boards: [
        {
          id: "1",
          name: "Board A",
          columns: [{ id: "mirror_zwerf", title: "Zwervende mirror", type: "mirror", settings_str: '{"relation_column":{"bestaat_niet":true},"displayed_column":{"iets":true}}' }],
        },
      ],
    });

    const analyse = await analyseerBoardRelaties("1");
    expect(analyse!.mirrorKolommen[0]!.bronRelatieKolom).toBeNull();
  });

  it("geeft null terug voor een onbestaand board — geen crash", async () => {
    mockQuery.mockResolvedValueOnce({ boards: [] });
    expect(await analyseerBoardRelaties("onbestaand")).toBeNull();
  });
});
