#!/usr/bin/env node
/**
 * mfr® MCP Server v3
 * Direkter Zugriff auf die Mobile Field Report API via MCP Tools
 *
 * 39 Tools:
 *   READ  → get_service_requests, get_service_objects, get_companies, get_contacts,
 *            get_appointments, get_users, get_documents, get_time_events, get_tags, get_webhooks,
 *            get_items, get_steps, get_step_list_templates, get_item_types, get_cost_centers,
 *            get_offers, get_invoices, get_projects
 *   WRITE → create_company, update_company, create_contact, update_contact,
 *            create_service_object, update_service_object,
 *            create_service_request, update_service_request, delete_service_request,
 *            create_appointment, update_appointment,
 *            create_webhook, delete_webhook,
 *            create_item, update_item, delete_item,
 *            create_offer, update_offer,
 *            create_project, update_project,
 *            generate_report
 *
 * Webhook-Strategie: Einmalig anlegen → mfr® pusht Events an n8n (kein Polling).
 * Bekannte WebHookTypes: ServiceRequestStateChanged, ServiceRequestCreated,
 *   AppointmentCreated, AppointmentChanged, TimeEventCreated
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

// --- Config aus Umgebungsvariablen ---
const BASE_URL = process.env.MFR_BASE_URL || 'https://portal.mobilefieldreport.com';
const USERNAME = process.env.MFR_USERNAME;
const PASSWORD = process.env.MFR_PASSWORD;

function getAuthHeader() {
  if (!USERNAME || !PASSWORD) {
    throw new Error('MFR_USERNAME und MFR_PASSWORD müssen als Umgebungsvariablen gesetzt sein');
  }
  return 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64');
}

// --- HTTP Helper ---
async function mfrFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Authorization': getAuthHeader(),
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    // DELETE gibt oft 204 No Content zurück
    if (res.status === 204) {
      return { success: true };
    }

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      throw new Error(`mfr® API Fehler ${res.status}: ${typeof data === 'object' ? JSON.stringify(data) : data}`);
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

// --- OData URL Builder ---
function buildODataUrl(endpoint, { filter, expand, select, top, orderby, search } = {}) {
  const params = new URLSearchParams();
  if (filter)             params.set('$filter', filter);
  if (expand)             params.set('$expand', expand);
  if (select)             params.set('$select', select);
  if (top !== undefined)  params.set('$top', String(top));
  if (orderby)            params.set('$orderby', orderby);
  if (search)             params.set('$search', search);
  const qs = params.toString();
  return `/odata/${endpoint}${qs ? '?' + qs : ''}`;
}

// --- Tool Definitionen ---
const TOOLS = [

  // ── READ ──────────────────────────────────────────────────────────────────

  {
    name: 'mfr_get_service_requests',
    description: 'Liest ServiceRequests (Aufträge) aus mfr®. Unterstützt $filter, $expand, $select, $top, $orderby.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"Status eq 'Open'\"" },
        expand:  { type: 'string', description: "Navigation Properties, z.B. \"Appointments,Contacts,TimeEvents,ServiceObjects\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder, z.B. \"Id,Subject,Status\" (reduziert Traffic)" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 10)' },
        orderby: { type: 'string', description: "Sortierung, z.B. \"DateOfCreation desc\"" },
      },
    },
  },

  {
    name: 'mfr_get_service_objects',
    description: 'Liest ServiceObjects (Einsatzorte/Anlagen) aus mfr®. Filtern nach Firma mit filter="CompanyId eq \'ID\'".',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"CompanyId eq '66945843203'\"" },
        expand:  { type: 'string', description: "z.B. \"Contacts,Company,Tags\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder (reduziert Traffic)" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
        orderby: { type: 'string', description: 'Sortierung' },
      },
    },
  },

  {
    name: 'mfr_get_companies',
    description: 'Liest Firmen/Kunden aus mfr®. Unterstützt $filter, $search, $expand, $select.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        search:  { type: 'string', description: 'Volltextsuche nach Firmenname' },
        expand:  { type: 'string', description: "z.B. \"Contacts,ServiceObjects,MainContact\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder, z.B. \"Id,Name,SupportMail\" (reduziert Traffic)" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 10)' },
      },
    },
  },

  {
    name: 'mfr_get_contacts',
    description: 'Liest Kontakte/Ansprechpartner aus mfr®.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"CompanyId eq '66945843203'\"" },
        expand:  { type: 'string', description: "z.B. \"Company,User\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder (reduziert Traffic)" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
      },
    },
  },

  {
    name: 'mfr_get_appointments',
    description: 'Liest Termine aus mfr®. Datumsfilter: StartDateTime ge datetime\'2026-03-01T00:00:00\'',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter" },
        expand:  { type: 'string', description: "z.B. \"Contacts\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder (reduziert Traffic)" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
        orderby: { type: 'string', description: 'Sortierung (default: StartDateTime asc)' },
      },
    },
  },

  {
    name: 'mfr_get_users',
    description: 'Liest Benutzer/Techniker aus mfr® (inkl. Kontaktdaten via expand=Contact).',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"IsApproved eq true\"" },
        expand:  { type: 'string', description: "z.B. \"Contact\" (empfohlen, liefert Name+Email)" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 50)' },
      },
    },
  },

  {
    name: 'mfr_get_documents',
    description: 'Liest Dokument-Metadaten aus mfr®. Das Feld "URI" im Response enthält den direkten Download-Link.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "z.B. \"ServiceRequest\"" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
        orderby: { type: 'string', description: "Sortierung, z.B. \"DateModified desc\"" },
      },
    },
  },

  {
    name: 'mfr_get_time_events',
    description: 'Liest Zeiterfassungs-Einträge (Check-in/out, Arbeitszeiten) aus mfr®.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "z.B. \"Contact,ServiceRequest\"" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
        orderby: { type: 'string', description: 'Sortierung' },
      },
    },
  },

  {
    name: 'mfr_get_tags',
    description: 'Liest Tags aus mfr® (für Kategorisierung von Aufträgen, Firmen, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'OData $filter' },
        top:    { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 50)' },
      },
    },
  },

  {
    name: 'mfr_get_webhooks',
    description: 'Liest konfigurierte Webhooks aus mfr®. Zeigt welche Events bereits abonniert sind.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },

  // ── WRITE: Firmen & Kontakte ───────────────────────────────────────────────

  {
    name: 'mfr_create_company',
    description: 'Legt eine neue Firma/Kunden in mfr® an.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:             { type: 'string', description: 'Firmenname (Pflicht)' },
        externalId:       { type: 'string', description: 'Externe ID (z.B. aus CRM/ERP)' },
        addressString:    { type: 'string', description: 'Straße + Hausnummer' },
        postal:           { type: 'string', description: 'PLZ' },
        city:             { type: 'string', description: 'Stadt' },
        country:          { type: 'string', description: 'Land' },
        supportMail:      { type: 'string', description: 'E-Mail' },
        supportTelephone: { type: 'string', description: 'Telefon' },
        note:             { type: 'string', description: 'Notiz' },
        isPhysicalPerson: { type: 'boolean', description: 'true = Privatperson, false = Firma (default: false)' },
        isSupplier:       { type: 'boolean', description: 'Lieferant? (default: false)' },
      },
    },
  },

  {
    name: 'mfr_update_company',
    description: 'Aktualisiert eine bestehende Firma in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'Company ID' },
        fields: {
          type: 'object',
          description: 'Key-Value-Paare der zu ändernden Felder, z.B. {"Name": "Neuer Name", "SupportMail": "neu@firma.de"}',
        },
      },
    },
  },

  {
    name: 'mfr_create_contact',
    description: 'Legt einen neuen Kontakt/Ansprechpartner in mfr® an.',
    inputSchema: {
      type: 'object',
      required: ['lastName'],
      properties: {
        firstName:   { type: 'string', description: 'Vorname' },
        lastName:    { type: 'string', description: 'Nachname (Pflicht)' },
        email:       { type: 'string', description: 'E-Mail-Adresse' },
        mobilePhone: { type: 'string', description: 'Mobiltelefon' },
        telephone:   { type: 'string', description: 'Festnetz' },
        jobTitle:    { type: 'string', description: 'Position/Berufsbezeichnung' },
        companyId:   { type: 'string', description: 'Firmen-ID (0 = kein Unternehmen)' },
        gender:      { type: 'string', description: 'Geschlecht: Male | Female | Unknown' },
        externalId:  { type: 'string', description: 'Externe ID' },
        note:        { type: 'string', description: 'Notiz' },
      },
    },
  },

  {
    name: 'mfr_update_contact',
    description: 'Aktualisiert einen bestehenden Kontakt in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'Contact ID' },
        fields: {
          type: 'object',
          description: 'Key-Value-Paare der zu ändernden Felder, z.B. {"Email": "neu@mail.de", "MobilePhone": "0176..."}',
        },
      },
    },
  },

  // ── WRITE: Einsatzorte ─────────────────────────────────────────────────────

  {
    name: 'mfr_create_service_object',
    description: 'Legt einen neuen Einsatzort/Serviceobjekt (Anlage) in mfr® an.',
    inputSchema: {
      type: 'object',
      required: ['name', 'companyId'],
      properties: {
        name:          { type: 'string', description: 'Name des Einsatzorts (Pflicht)' },
        companyId:     { type: 'string', description: 'Firmen-ID (Pflicht)' },
        externalId:    { type: 'string', description: 'Externe ID' },
        addressString: { type: 'string', description: 'Straße + Hausnummer' },
        postal:        { type: 'string', description: 'PLZ' },
        city:          { type: 'string', description: 'Stadt' },
        country:       { type: 'string', description: 'Land' },
        contactIds:    {
          type: 'array',
          items: { type: 'string' },
          description: 'Zugeordnete Kontakt-IDs',
        },
        note:          { type: 'string', description: 'Notiz/Beschreibung' },
      },
    },
  },

  {
    name: 'mfr_update_service_object',
    description: 'Aktualisiert einen bestehenden Einsatzort in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'ServiceObject ID' },
        fields: {
          type: 'object',
          description: 'Key-Value-Paare der zu ändernden Felder',
        },
      },
    },
  },

  // ── WRITE: Aufträge ────────────────────────────────────────────────────────

  {
    name: 'mfr_create_service_request',
    description: 'Legt einen neuen Auftrag in mfr® an.',
    inputSchema: {
      type: 'object',
      required: ['title', 'customerId'],
      properties: {
        title:           { type: 'string', description: 'Auftragsbezeichnung' },
        customerId:      { type: 'string', description: 'Firmen-ID' },
        description:     { type: 'string', description: 'Beschreibung' },
        contactId:       { type: 'string', description: 'Kontakt-ID' },
        serviceObjectId: { type: 'string', description: 'Serviceobjekt-ID' },
        templateId:      { type: 'string', description: 'CreateFromServiceRequestTemplateId' },
      },
    },
  },

  {
    name: 'mfr_update_service_request',
    description: 'Aktualisiert einen bestehenden Auftrag (Status, Beschreibung, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'ServiceRequest ID' },
        fields: {
          type: 'object',
          description: "Key-Value-Paare der zu ändernden Felder, z.B. {\"Status\": \"eIsWorkDone\"}",
        },
      },
    },
  },

  {
    name: 'mfr_delete_service_request',
    description: 'Löscht einen Auftrag aus mfr®. Achtung: nicht umkehrbar!',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'ServiceRequest ID' },
      },
    },
  },

  // ── WRITE: Termine ─────────────────────────────────────────────────────────

  {
    name: 'mfr_create_appointment',
    description: 'Legt einen neuen Termin zu einem Auftrag an.',
    inputSchema: {
      type: 'object',
      required: ['serviceRequestId', 'startDateTime', 'endDateTime'],
      properties: {
        serviceRequestId: { type: 'string', description: 'ServiceRequest ID' },
        startDateTime:    { type: 'string', description: 'ISO 8601, z.B. 2026-03-10T09:00:00' },
        endDateTime:      { type: 'string', description: 'ISO 8601' },
        contactIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Techniker-IDs',
        },
        location: { type: 'string', description: 'Ort' },
      },
    },
  },

  {
    name: 'mfr_update_appointment',
    description: 'Aktualisiert einen bestehenden Termin in mfr® (Zeit, Ort, Techniker, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'Appointment ID' },
        fields: {
          type: 'object',
          description: 'Key-Value-Paare, z.B. {"StartDateTime": "2026-03-15T09:00:00", "Location": "Berlin"}',
        },
      },
    },
  },

  // ── WRITE: Webhooks (event-driven, kein Polling) ───────────────────────────

  {
    name: 'mfr_create_webhook',
    description: [
      'Registriert einen Webhook in mfr® → mfr® sendet Events an die n8n-URL (kein Polling nötig).',
      'Bekannte WebHookTypes: ServiceRequestStateChanged, ServiceRequestCreated,',
      'AppointmentCreated, AppointmentChanged, TimeEventCreated.',
      'callbackUrl = ngrok-URL des n8n Webhook-Nodes.',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['webHookType', 'callbackUrl'],
      properties: {
        webHookType:  { type: 'string', description: "Event-Typ, z.B. \"ServiceRequestStateChanged\"" },
        callbackUrl:  { type: 'string', description: "n8n Webhook-URL, z.B. \"https://xyz.ngrok.io/webhook/mfr-events\"" },
        externalId:   { type: 'string', description: "Optionale externe ID zur Identifikation" },
      },
    },
  },

  {
    name: 'mfr_delete_webhook',
    description: 'Löscht einen registrierten Webhook aus mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Webhook ID' },
      },
    },
  },

  // ── READ: Items (Materialien/Artikel) ────────────────────────────────────

  {
    name: 'mfr_get_items',
    description: 'Liest Materialien/Artikel aus mfr®. Direkt via Items-Endpoint oder via expand="Items" in mfr_get_service_requests.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "z.B. \"ItemType\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder (reduziert Traffic)" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
        orderby: { type: 'string', description: 'Sortierung' },
      },
    },
  },

  {
    name: 'mfr_create_item',
    description: 'Legt einen Materialartikel zu einem ServiceRequest an (verwendetes Material, Ersatzteile, Arbeitsstunden, etc.).',
    inputSchema: {
      type: 'object',
      required: ['serviceRequestId', 'nameOrNumber'],
      properties: {
        serviceRequestId:     { type: 'string', description: 'ServiceRequest ID (Pflicht)' },
        nameOrNumber:         { type: 'string', description: 'Bezeichnung oder Artikelnummer (Pflicht)' },
        quantityHours:        { type: 'string', description: 'Istmenge (z.B. "2.00")' },
        plannedQuantityHours: { type: 'string', description: 'Planmenge' },
        price:                { type: 'string', description: 'Einzelpreis (z.B. "12.50")' },
        costs:                { type: 'string', description: 'Einkaufskosten' },
        discount:             { type: 'string', description: 'Rabatt in % (z.B. "0.00")' },
        vat:                  { type: 'string', description: 'MwSt. (z.B. "0.19" für 19%)' },
        type:                 { type: 'string', description: 'Typ: Equipment | Material | Labour | Travel' },
        itemTypeId:           { type: 'string', description: 'Artikel-Typ-ID (aus mfr_get_item_types)' },
        unitId:               { type: 'string', description: 'Einheit-ID (aus mfr_get_item_types mit expand=Unit)' },
        unitString:           { type: 'string', description: 'Einheit als Text (z.B. "Stück", "m", "Stunde")' },
        manufacture:          { type: 'string', description: 'Hersteller/Seriennummer' },
        externalId:           { type: 'string', description: 'Externe ID' },
        note:                 { type: 'string', description: 'Notiz' },
        serviceObjectId:      { type: 'string', description: 'Serviceobjekt-ID (optional, "0" = kein Objekt)' },
      },
    },
  },

  {
    name: 'mfr_update_item',
    description: 'Aktualisiert einen Materialartikel in mfr® (Menge, Preis, Notiz, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id:     { type: 'string', description: 'Item ID' },
        fields: { type: 'object', description: 'Key-Value-Paare der zu ändernden Felder, z.B. {"QuantityHours": "3.00", "Price": "15.00"}' },
      },
    },
  },

  {
    name: 'mfr_delete_item',
    description: 'Löscht einen Materialartikel aus mfr®. Achtung: nicht umkehrbar!',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'string', description: 'Item ID' },
      },
    },
  },

  // ── READ: Steps (Arbeitsschritte/Checklisten) ─────────────────────────────

  {
    name: 'mfr_get_steps',
    description: 'Liest Arbeitsschritte/Checklisten-Einträge aus mfr®. Enthält IsDone, HasError, Type, Data (JSON-Felder). Alternativ via expand="Steps" in mfr_get_service_requests.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, z.B. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "z.B. \"Attachments\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 50)' },
        orderby: { type: 'string', description: 'Sortierung (default: SortOrder asc)' },
      },
    },
  },

  {
    name: 'mfr_get_step_list_templates',
    description: 'Liest Checklisten-Vorlagen (StepListTemplates) aus mfr®. Liefert Template-IDs für Auftrags-Erstellung und Checklisten-Generator.',
    inputSchema: {
      type: 'object',
      properties: {
        expand: { type: 'string', description: "z.B. \"Steps\" (liefert alle Schritte der Vorlage)" },
        top:    { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
      },
    },
  },

  // ── READ: Artikelkatalog & Einheiten ──────────────────────────────────────

  {
    name: 'mfr_get_item_types',
    description: 'Liest Artikel-Typen/Katalog aus mfr®. Liefert ItemTypeId und UnitId-Werte für mfr_create_item.',
    inputSchema: {
      type: 'object',
      properties: {
        expand: { type: 'string', description: "z.B. \"Unit\" (empfohlen: liefert Einheit direkt mit)" },
        filter: { type: 'string', description: 'OData $filter' },
        top:    { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 50)' },
      },
    },
  },

  {
    name: 'mfr_get_cost_centers',
    description: 'Liest Kostenstellen aus mfr®. Liefert CostCenterId-Werte für ServiceRequests.',
    inputSchema: {
      type: 'object',
      properties: {
        top: { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 50)' },
      },
    },
  },

  // ── READ/WRITE: Angebote ───────────────────────────────────────────────────

  {
    name: 'mfr_get_offers',
    description: 'Liest Angebote aus mfr®. Navigation Properties: Tags, Contacts, Documents, Qualifications, Destination (ServiceObject).',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        expand:  { type: 'string', description: "z.B. \"Tags,Contacts,Documents,Destination\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 10)' },
        orderby: { type: 'string', description: 'Sortierung' },
      },
    },
  },

  {
    name: 'mfr_create_offer',
    description: 'Legt ein neues Angebot in mfr® an.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:        { type: 'string', description: 'Angebotsname (Pflicht)' },
        externalId:  { type: 'string', description: 'Externe ID (z.B. "OFFER-001")' },
        description: { type: 'string', description: 'Beschreibung' },
      },
    },
  },

  {
    name: 'mfr_update_offer',
    description: 'Aktualisiert ein bestehendes Angebot in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id:     { type: 'string', description: 'Offer ID' },
        fields: { type: 'object', description: 'Key-Value-Paare der zu ändernden Felder, z.B. {"Name": "Neuer Angebotsname"}' },
      },
    },
  },

  // ── READ: Rechnungen ───────────────────────────────────────────────────────

  {
    name: 'mfr_get_invoices',
    description: 'Liest Rechnungen aus mfr®. Das Feld URI enthält den direkten PDF-Download-Link. InvoiceState-Werte: eIsCancelled, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        select:  { type: 'string', description: "Nur bestimmte Felder, z.B. \"Id,InvoiceId,InvoiceBalance,DueDate,URI,InvoiceState\"" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 20)' },
        orderby: { type: 'string', description: "Sortierung (default: DateOfCreation desc)" },
      },
    },
  },

  // ── READ/WRITE: Projekte ───────────────────────────────────────────────────

  {
    name: 'mfr_get_projects',
    description: 'Liest Projekte aus mfr®. Projekte gruppieren mehrere ServiceRequests mit Budget-Tracking (Zeit + Material).',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        expand:  { type: 'string', description: "z.B. \"Tags\"" },
        select:  { type: 'string', description: "Nur bestimmte Felder" },
        top:     { type: 'number', description: 'Max. Anzahl Ergebnisse (default: 10)' },
        orderby: { type: 'string', description: 'Sortierung' },
      },
    },
  },

  {
    name: 'mfr_create_project',
    description: 'Legt ein neues Projekt in mfr® an. Projekte können Budget (Zeit + Material) tracken und mehrere ServiceRequests bündeln.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:           { type: 'string', description: 'Projektname (Pflicht)' },
        externalId:     { type: 'string', description: 'Externe ID' },
        customerId:     { type: 'string', description: 'Firmen-ID' },
        budgetTime:     { type: 'string', description: 'Zeitbudget in Stunden (z.B. "65")' },
        budgetMaterial: { type: 'string', description: 'Materialbudget' },
      },
    },
  },

  {
    name: 'mfr_update_project',
    description: 'Aktualisiert ein bestehendes Projekt in mfr® (Name, Budget, IsClosed, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id:     { type: 'string', description: 'Project ID' },
        fields: { type: 'object', description: 'Key-Value-Paare, z.B. {"IsClosed": true, "BudgetTime": "80"}' },
      },
    },
  },

  // ── Berichte generieren ────────────────────────────────────────────────────

  {
    name: 'mfr_generate_report',
    description: [
      'Generiert einen Bericht/Protokoll für einen ServiceRequest aus einer Report-Definition.',
      'Gibt einen Hash + fertigen Download-URL zurück.',
      'Download: GET {downloadUrl} mit Basic Auth-Header (Authorization: Basic ...).',
      'reportDefinitionId = ID der Berichtsdefinition (in mfr® unter Einstellungen → Berichte).',
    ].join(' '),
    inputSchema: {
      type: 'object',
      required: ['serviceRequestId', 'reportDefinitionId'],
      properties: {
        serviceRequestId:   { type: 'string', description: 'ServiceRequest ID' },
        reportDefinitionId: { type: 'string', description: 'Report-Definitions-ID' },
      },
    },
  },
];

// --- Tool Handler ---
async function handleTool(name, args) {
  switch (name) {

    // ── READ ──────────────────────────────────────────────────────────────────

    case 'mfr_get_service_requests': {
      const url = buildODataUrl('ServiceRequests', {
        filter: args.filter,
        expand: args.expand,
        select: args.select,
        top:    args.top ?? 10,
        orderby: args.orderby,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_service_objects': {
      const url = buildODataUrl('ServiceObjects', {
        filter:  args.filter,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 20,
        orderby: args.orderby,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_companies': {
      const url = buildODataUrl('Companies', {
        filter:  args.filter,
        search:  args.search,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 10,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_contacts': {
      const url = buildODataUrl('Contacts', {
        filter:  args.filter,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 20,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_appointments': {
      const url = buildODataUrl('Appointments', {
        filter:  args.filter,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 20,
        orderby: args.orderby ?? 'StartDateTime asc',
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_users': {
      const url = buildODataUrl('Users', {
        filter:  args.filter,
        expand:  args.expand,
        top:     args.top ?? 50,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_documents': {
      const url = buildODataUrl('Documents', {
        filter:  args.filter,
        expand:  args.expand,
        top:     args.top ?? 20,
        orderby: args.orderby ?? 'DateModified desc',
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_time_events': {
      const url = buildODataUrl('TimeEvents', {
        filter:  args.filter,
        expand:  args.expand,
        top:     args.top ?? 20,
        orderby: args.orderby,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_tags': {
      const url = buildODataUrl('Tags', {
        filter: args.filter,
        top:    args.top ?? 50,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_webhooks': {
      const data = await mfrFetch('/odata/WebHooks');
      return data?.value ?? data;
    }

    // ── WRITE: Firmen & Kontakte ───────────────────────────────────────────────

    case 'mfr_create_company': {
      if (!args.name) throw new Error('name ist erforderlich');
      const body = { Name: args.name };
      if (args.externalId)       body.ExternalId = args.externalId;
      if (args.supportMail)      body.SupportMail = args.supportMail;
      if (args.supportTelephone) body.SupportTelephone = args.supportTelephone;
      if (args.note)             body.Note = args.note;
      if (args.isPhysicalPerson !== undefined) body.IsPhysicalPerson = args.isPhysicalPerson;
      if (args.isSupplier !== undefined)       body.IsSupplier = args.isSupplier;
      if (args.addressString || args.postal || args.city) {
        body.Location = {};
        if (args.addressString) body.Location.AddressString = args.addressString;
        if (args.postal)        body.Location.Postal = args.postal;
        if (args.city)          body.Location.City = args.city;
        if (args.country)       body.Location.Country = args.country;
      }
      return await mfrFetch('/odata/Companies', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_company': {
      if (!args.id)     throw new Error('id ist erforderlich');
      if (!args.fields) throw new Error('fields ist erforderlich');
      const data = await mfrFetch(`/odata/Companies(${args.id}L)`, {
        method: 'PUT',
        body: JSON.stringify(args.fields),
      });
      return data ?? { success: true, id: args.id };
    }

    case 'mfr_create_contact': {
      if (!args.lastName) throw new Error('lastName ist erforderlich');
      const body = { LastName: args.lastName };
      if (args.firstName)   body.FirstName = args.firstName;
      if (args.email)       body.Email = args.email;
      if (args.mobilePhone) body.MobilePhone = args.mobilePhone;
      if (args.telephone)   body.Telephone = args.telephone;
      if (args.jobTitle)    body.JobTitle = args.jobTitle;
      if (args.companyId)   body.CompanyId = args.companyId;
      if (args.gender)      body.Gender = args.gender;
      if (args.externalId)  body.ExternalId = args.externalId;
      if (args.note)        body.Note = args.note;
      return await mfrFetch('/odata/Contacts', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_contact': {
      if (!args.id)     throw new Error('id ist erforderlich');
      if (!args.fields) throw new Error('fields ist erforderlich');
      const data = await mfrFetch(`/odata/Contacts(${args.id}L)`, {
        method: 'PUT',
        body: JSON.stringify(args.fields),
      });
      return data ?? { success: true, id: args.id };
    }

    // ── WRITE: Einsatzorte ─────────────────────────────────────────────────────

    case 'mfr_create_service_object': {
      if (!args.name)      throw new Error('name ist erforderlich');
      if (!args.companyId) throw new Error('companyId ist erforderlich');
      const body = {
        Name:      args.name,
        CompanyId: args.companyId,
      };
      if (args.externalId) body.ExternalId = args.externalId;
      if (args.note)       body.Note = args.note;
      if (args.addressString || args.postal || args.city) {
        body.Location = {};
        if (args.addressString) body.Location.AddressString = args.addressString;
        if (args.postal)        body.Location.Postal = args.postal;
        if (args.city)          body.Location.City = args.city;
        if (args.country)       body.Location.Country = args.country;
      }
      if (args.contactIds?.length) {
        body.Contacts = args.contactIds.map(id => ({ Id: id }));
      }
      return await mfrFetch('/odata/ServiceObjects', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_service_object': {
      if (!args.id)     throw new Error('id ist erforderlich');
      if (!args.fields) throw new Error('fields ist erforderlich');
      const data = await mfrFetch(`/odata/ServiceObjects(${args.id}L)`, {
        method: 'PUT',
        body: JSON.stringify(args.fields),
      });
      return data ?? { success: true, id: args.id };
    }

    // ── WRITE: Aufträge ────────────────────────────────────────────────────────

    case 'mfr_create_service_request': {
      if (!args.title)      throw new Error('title ist erforderlich');
      if (!args.customerId) throw new Error('customerId ist erforderlich');
      const body = {
        Subject:   args.title,
        CompanyId: args.customerId,
      };
      if (args.description)     body.Description = args.description;
      if (args.contactId)       body.ContactId = args.contactId;
      if (args.serviceObjectId) body.ServiceObjectId = args.serviceObjectId;
      if (args.templateId)      body.CreateFromServiceRequestTemplateId = args.templateId;
      return await mfrFetch('/mfr/ServiceRequest/Deep', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_service_request': {
      if (!args.id)                              throw new Error('id ist erforderlich');
      if (!args.fields || typeof args.fields !== 'object') throw new Error('fields muss ein Objekt sein');
      const data = await mfrFetch(`/mfr/ServiceRequest/${args.id}`, {
        method: 'PUT',
        body: JSON.stringify(args.fields),
      });
      return data ?? { success: true, id: args.id };
    }

    case 'mfr_delete_service_request': {
      if (!args.id) throw new Error('id ist erforderlich');
      return await mfrFetch(`/odata/ServiceRequests(${args.id}L)`, { method: 'DELETE' });
    }

    // ── WRITE: Termine ─────────────────────────────────────────────────────────

    case 'mfr_create_appointment': {
      if (!args.serviceRequestId) throw new Error('serviceRequestId ist erforderlich');
      if (!args.startDateTime)    throw new Error('startDateTime ist erforderlich');
      if (!args.endDateTime)      throw new Error('endDateTime ist erforderlich');
      const body = {
        ServiceRequestId: args.serviceRequestId,
        StartDateTime:    args.startDateTime,
        EndDateTime:      args.endDateTime,
      };
      if (args.location)        body.Location = args.location;
      if (args.contactIds?.length) {
        body.Contacts = args.contactIds.map(id => ({ ContactId: id }));
      }
      return await mfrFetch('/odata/Appointments', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_appointment': {
      if (!args.id)     throw new Error('id ist erforderlich');
      if (!args.fields) throw new Error('fields ist erforderlich');
      const data = await mfrFetch(`/odata/Appointments(${args.id}L)`, {
        method: 'PUT',
        body: JSON.stringify(args.fields),
      });
      return data ?? { success: true, id: args.id };
    }

    // ── WRITE: Webhooks ────────────────────────────────────────────────────────

    case 'mfr_create_webhook': {
      if (!args.webHookType) throw new Error('webHookType ist erforderlich');
      if (!args.callbackUrl) throw new Error('callbackUrl ist erforderlich');
      const body = {
        WebHookType: args.webHookType,
        CallbackUrl: args.callbackUrl,
      };
      if (args.externalId) body.ExternalId = args.externalId;
      return await mfrFetch('/odata/WebHooks', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_delete_webhook': {
      if (!args.id) throw new Error('id ist erforderlich');
      return await mfrFetch(`/odata/WebHooks(${args.id}L)`, { method: 'DELETE' });
    }

    // ── READ: Items ────────────────────────────────────────────────────────────

    case 'mfr_get_items': {
      const url = buildODataUrl('Items', {
        filter:  args.filter,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 20,
        orderby: args.orderby,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_create_item': {
      if (!args.serviceRequestId) throw new Error('serviceRequestId ist erforderlich');
      if (!args.nameOrNumber)     throw new Error('nameOrNumber ist erforderlich');
      const body = {
        ServiceRequestId: args.serviceRequestId,
        NameOrNumber:     args.nameOrNumber,
        ServiceObjectId:  args.serviceObjectId ?? '0',
      };
      if (args.quantityHours !== undefined)        body.QuantityHours = args.quantityHours;
      if (args.plannedQuantityHours !== undefined) body.PlannedQuantityHours = args.plannedQuantityHours;
      if (args.price !== undefined)   body.Price = args.price;
      if (args.costs !== undefined)   body.Costs = args.costs;
      if (args.discount !== undefined) body.Discount = args.discount;
      if (args.vat !== undefined)     body.VAT = args.vat;
      if (args.type)        body.Type = args.type;
      if (args.itemTypeId)  body.ItemTypeId = args.itemTypeId;
      if (args.unitId)      body.UnitId = args.unitId;
      if (args.unitString)  body.UnitString = args.unitString;
      if (args.manufacture) body.Manufacture = args.manufacture;
      if (args.externalId)  body.ExternalId = args.externalId;
      if (args.note)        body.Note = args.note;
      return await mfrFetch('/odata/Items', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_item': {
      if (!args.id)     throw new Error('id ist erforderlich');
      if (!args.fields) throw new Error('fields ist erforderlich');
      const data = await mfrFetch(`/odata/Items(${args.id}L)`, {
        method: 'PUT',
        body: JSON.stringify({ Id: args.id, ...args.fields }),
      });
      return data ?? { success: true, id: args.id };
    }

    case 'mfr_delete_item': {
      if (!args.id) throw new Error('id ist erforderlich');
      return await mfrFetch(`/odata/Items(${args.id}L)`, { method: 'DELETE' });
    }

    // ── READ: Steps ────────────────────────────────────────────────────────────

    case 'mfr_get_steps': {
      const url = buildODataUrl('Steps', {
        filter:  args.filter,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 50,
        orderby: args.orderby ?? 'SortOrder asc',
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_step_list_templates': {
      const url = buildODataUrl('StepListTemplates', {
        expand: args.expand,
        top:    args.top ?? 20,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    // ── READ: Artikelkatalog & Kostenstellen ────────────────────────────────────

    case 'mfr_get_item_types': {
      const url = buildODataUrl('ItemTypes', {
        expand: args.expand,
        filter: args.filter,
        top:    args.top ?? 50,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_get_cost_centers': {
      const url = buildODataUrl('CostCenters', {
        top: args.top ?? 50,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    // ── Angebote ───────────────────────────────────────────────────────────────

    case 'mfr_get_offers': {
      const url = buildODataUrl('Offers', {
        filter:  args.filter,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 10,
        orderby: args.orderby,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_create_offer': {
      if (!args.name) throw new Error('name ist erforderlich');
      const body = { Name: args.name };
      if (args.externalId)  body.ExternalId = args.externalId;
      if (args.description) body.Description = args.description;
      return await mfrFetch('/odata/Offers', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_offer': {
      if (!args.id)     throw new Error('id ist erforderlich');
      if (!args.fields) throw new Error('fields ist erforderlich');
      const data = await mfrFetch(`/odata/Offers(${args.id}L)`, {
        method: 'PUT',
        body: JSON.stringify(args.fields),
      });
      return data ?? { success: true, id: args.id };
    }

    // ── Rechnungen ─────────────────────────────────────────────────────────────

    case 'mfr_get_invoices': {
      const url = buildODataUrl('Invoices', {
        filter:  args.filter,
        select:  args.select,
        top:     args.top ?? 20,
        orderby: args.orderby ?? 'DateOfCreation desc',
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    // ── Projekte ───────────────────────────────────────────────────────────────

    case 'mfr_get_projects': {
      const url = buildODataUrl('Projects', {
        filter:  args.filter,
        expand:  args.expand,
        select:  args.select,
        top:     args.top ?? 10,
        orderby: args.orderby,
      });
      const data = await mfrFetch(url);
      return data?.value ?? data;
    }

    case 'mfr_create_project': {
      if (!args.name) throw new Error('name ist erforderlich');
      const body = { Name: args.name };
      if (args.externalId)     body.ExternalId = args.externalId;
      if (args.customerId)     body.CustomerId = args.customerId;
      if (args.budgetTime)     body.BudgetTime = args.budgetTime;
      if (args.budgetMaterial) body.BudgetMaterial = args.budgetMaterial;
      return await mfrFetch('/odata/Projects', { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_project': {
      if (!args.id)     throw new Error('id ist erforderlich');
      if (!args.fields) throw new Error('fields ist erforderlich');
      const data = await mfrFetch(`/odata/Projects(${args.id}L)`, {
        method: 'PUT',
        body: JSON.stringify(args.fields),
      });
      return data ?? { success: true, id: args.id };
    }

    // ── Berichte generieren ────────────────────────────────────────────────────

    case 'mfr_generate_report': {
      if (!args.serviceRequestId)   throw new Error('serviceRequestId ist erforderlich');
      if (!args.reportDefinitionId) throw new Error('reportDefinitionId ist erforderlich');
      const data = await mfrFetch(
        `/odata/ServiceRequests(${args.serviceRequestId}L)/GenerateReportHash`,
        {
          method: 'POST',
          body: JSON.stringify({ reportDefinitionId: args.reportDefinitionId }),
        }
      );
      const hash = data?.value ?? data;
      return {
        hash,
        downloadUrl: `${BASE_URL}/System/CustomerReport/${hash}`,
        note: 'Download-URL mit Basic Auth abrufen: GET {downloadUrl} mit Authorization-Header',
      };
    }

    default:
      throw new Error(`Unbekanntes Tool: ${name}`);
  }
}

// --- MCP Server Setup ---
const server = new Server(
  { name: 'mfr-mcp', version: '3.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const result = await handleTool(name, args || {});
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Fehler: ${err.message}`,
        },
      ],
      isError: true,
    };
  }
});

// --- Start ---
const transport = new StdioServerTransport();
await server.connect(transport);
