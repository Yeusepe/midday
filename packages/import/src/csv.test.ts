import { describe, expect, it } from "bun:test";
import { decodeImportCsvContent, normalizeImportCsvContent } from "./csv";

describe("decodeImportCsvContent", () => {
  it("uses windows-1252 when utf-8 replacement characters would be introduced", () => {
    const bytes = new Uint8Array([
      0x46, 0x65, 0x63, 0x68, 0x61, 0x20, 0x64, 0x65, 0x20, 0x54, 0x72, 0x61,
      0x6e, 0x73, 0x61, 0x63, 0x63, 0x69, 0xf3, 0x6e,
    ]);

    expect(decodeImportCsvContent(bytes)).toBe("Fecha de Transacci\u00f3n");
  });
});

describe("normalizeImportCsvContent", () => {
  it("finds a nested Spanish transaction table and computes signed amounts", () => {
    const content = [
      "Numero de Clientes, Nombre, Producto, Moneda",
      "3759964, SEBASTIAN VERGARA ALPIZAR, CR37010200009623625548, CRC",
      "",
      "Detalle de Estado Bancario",
      "Fecha de Transaccion, Referencia de Transaccion, Codigo de Transaccion, Descripcion de Transaccion, Debito de Transaccion, Credito de Transaccion, Balance de Transaccion",
      "01/06/2026, 960467401, MC, CD SINPE CITIBANK EUROPE PLC- , 0.00, 30260.79, 1378454.35",
      "02/06/2026, 60100000, CP, TAILSCALE US INC.        WWW.T, 2335.00, 0.00, 1374484.85",
      "",
      "Resumen de Estado Bancario",
      "Codigo Transaccion Totales, Cantidad Debitos Totales",
      "Total, 1",
    ].join("\n");

    const normalized = normalizeImportCsvContent(content);

    expect(normalized).toContain("Amount");
    expect(normalized).toContain("2026-06-01");
    expect(normalized).toContain("30260.79");
    expect(normalized).toContain("-2335");
    expect(normalized).not.toContain("Resumen de Estado Bancario");
    expect(normalized).not.toContain("SEBASTIAN VERGARA");
  });

  it("finds a nested English transaction table without relying on section names", () => {
    const content = [
      "Account Number,Account Holder",
      "1234,Example LLC",
      "",
      "Some arbitrary export heading",
      "Transaction Date,Reference,Details,Debit,Credit,Running Balance",
      "15/06/2026,ABC-1,Subscription,19.99,0.00,980.01",
      "16/06/2026,ABC-2,Customer payment,0.00,250.00,1230.01",
      "Totals,1,19.99,1,250.00",
    ].join("\n");

    const normalized = normalizeImportCsvContent(content);

    expect(normalized).toContain("Transaction Date");
    expect(normalized).toContain("Amount");
    expect(normalized).toContain("2026-06-15");
    expect(normalized).toContain("-19.99");
    expect(normalized).toContain("250");
    expect(normalized).not.toContain("Account Holder");
    expect(normalized).not.toContain("Totals");
  });

  it("leaves ordinary CSV files unchanged", () => {
    const content = ["Date,Description,Amount", "2026-06-01,Coffee,-5"].join(
      "\n",
    );

    expect(normalizeImportCsvContent(content)).toBe(content);
  });
});
