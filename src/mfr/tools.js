/**
 * mfr® MCP tool definitions and dispatcher.
 *
 * Shared by both the stdio server (local dev) and the HTTP server (production
 * remote MCP). Every handler receives the customer's credentials explicitly —
 * never reads them from process.env in production HTTP mode.
 */

import { mfrFetch, buildODataUrl, getBaseUrl } from './client.js';

export const TOOLS = [

  // ── READ ──────────────────────────────────────────────────────────────────

  {
    name: 'mfr_get_service_requests',
    description: 'Reads ServiceRequests (work orders) from mfr®. Supports $filter, $expand, $select, $top, $orderby.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"Status eq 'Open'\"" },
        expand:  { type: 'string', description: "Navigation properties, e.g. \"Appointments,Contacts,TimeEvents,ServiceObjects\"" },
        select:  { type: 'string', description: "Limit fields, e.g. \"Id,Subject,Status\" (reduces payload)" },
        top:     { type: 'number', description: 'Max results (default: 10)' },
        orderby: { type: 'string', description: "Sort, e.g. \"DateOfCreation desc\"" },
      },
    },
  },

  {
    name: 'mfr_get_service_objects',
    description: 'Reads ServiceObjects (sites/assets) from mfr®. Filter by company with filter="CompanyId eq \'ID\'".',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"CompanyId eq '66945843203'\"" },
        expand:  { type: 'string', description: "e.g. \"Contacts,Company,Tags\"" },
        select:  { type: 'string', description: "Limit fields (reduces payload)" },
        top:     { type: 'number', description: 'Max results (default: 20)' },
        orderby: { type: 'string', description: 'Sort' },
      },
    },
  },

  {
    name: 'mfr_get_companies',
    description: 'Reads companies/customers from mfr®. Supports $filter, $search, $expand, $select.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        search:  { type: 'string', description: 'Full-text search by company name' },
        expand:  { type: 'string', description: "e.g. \"Contacts,ServiceObjects,MainContact\"" },
        select:  { type: 'string', description: "Limit fields, e.g. \"Id,Name,SupportMail\"" },
        top:     { type: 'number', description: 'Max results (default: 10)' },
      },
    },
  },

  {
    name: 'mfr_get_contacts',
    description: 'Reads contacts from mfr®.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"CompanyId eq '66945843203'\"" },
        expand:  { type: 'string', description: "e.g. \"Company,User\"" },
        select:  { type: 'string', description: "Limit fields" },
        top:     { type: 'number', description: 'Max results (default: 20)' },
      },
    },
  },

  {
    name: 'mfr_get_appointments',
    description: 'Reads appointments from mfr®. Date filter: StartDateTime ge datetime\'2026-03-01T00:00:00\'',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter" },
        expand:  { type: 'string', description: "e.g. \"Contacts\"" },
        select:  { type: 'string', description: "Limit fields" },
        top:     { type: 'number', description: 'Max results (default: 20)' },
        orderby: { type: 'string', description: 'Sort (default: StartDateTime asc)' },
      },
    },
  },

  {
    name: 'mfr_get_users',
    description: 'Reads users/technicians from mfr® (use expand=Contact for name+email).',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"IsApproved eq true\"" },
        expand:  { type: 'string', description: "e.g. \"Contact\"" },
        top:     { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  },

  {
    name: 'mfr_get_documents',
    description: 'Reads document metadata from mfr®. The "URI" field is the direct download link.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "e.g. \"ServiceRequest\"" },
        top:     { type: 'number', description: 'Max results (default: 20)' },
        orderby: { type: 'string', description: "Sort, e.g. \"DateModified desc\"" },
      },
    },
  },

  {
    name: 'mfr_get_time_events',
    description: 'Reads time tracking entries (check-in/out, working hours) from mfr®.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "e.g. \"Contact,ServiceRequest\"" },
        top:     { type: 'number', description: 'Max results (default: 20)' },
        orderby: { type: 'string', description: 'Sort' },
      },
    },
  },

  {
    name: 'mfr_get_tags',
    description: 'Reads tags from mfr® (for categorizing work orders, companies, etc.).',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'OData $filter' },
        top:    { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  },

  {
    name: 'mfr_get_webhooks',
    description: 'Reads configured webhooks from mfr®. Shows which events are already subscribed.',
    inputSchema: { type: 'object', properties: {} },
  },

  // ── WRITE: Companies & Contacts ────────────────────────────────────────────

  {
    name: 'mfr_create_company',
    description: 'Creates a new company/customer in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:             { type: 'string', description: 'Company name (required)' },
        externalId:       { type: 'string', description: 'External ID (e.g. from CRM/ERP)' },
        addressString:    { type: 'string', description: 'Street + number' },
        postal:           { type: 'string', description: 'Postal code' },
        city:             { type: 'string', description: 'City' },
        country:          { type: 'string', description: 'Country' },
        supportMail:      { type: 'string', description: 'Email' },
        supportTelephone: { type: 'string', description: 'Phone' },
        note:             { type: 'string', description: 'Note' },
        isPhysicalPerson: { type: 'boolean', description: 'true = individual, false = company (default: false)' },
        isSupplier:       { type: 'boolean', description: 'Is supplier? (default: false)' },
      },
    },
  },

  {
    name: 'mfr_update_company',
    description: 'Updates an existing company in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'Company ID' },
        fields: { type: 'object', description: 'Field key-value pairs, e.g. {"Name": "New Name", "SupportMail": "new@firma.de"}' },
      },
    },
  },

  {
    name: 'mfr_create_contact',
    description: 'Creates a new contact in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['lastName'],
      properties: {
        firstName:   { type: 'string', description: 'First name' },
        lastName:    { type: 'string', description: 'Last name (required)' },
        email:       { type: 'string', description: 'Email address' },
        mobilePhone: { type: 'string', description: 'Mobile phone' },
        telephone:   { type: 'string', description: 'Landline' },
        jobTitle:    { type: 'string', description: 'Job title' },
        companyId:   { type: 'string', description: 'Company ID (0 = no company)' },
        gender:      { type: 'string', description: 'Gender: Male | Female | Unknown' },
        externalId:  { type: 'string', description: 'External ID' },
        note:        { type: 'string', description: 'Note' },
      },
    },
  },

  {
    name: 'mfr_update_contact',
    description: 'Updates an existing contact in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'Contact ID' },
        fields: { type: 'object', description: 'Field key-value pairs' },
      },
    },
  },

  // ── WRITE: ServiceObjects ──────────────────────────────────────────────────

  {
    name: 'mfr_create_service_object',
    description: 'Creates a new service object/site in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['name', 'companyId'],
      properties: {
        name:          { type: 'string', description: 'Site name (required)' },
        companyId:     { type: 'string', description: 'Company ID (required)' },
        externalId:    { type: 'string', description: 'External ID' },
        addressString: { type: 'string', description: 'Street + number' },
        postal:        { type: 'string', description: 'Postal code' },
        city:          { type: 'string', description: 'City' },
        country:       { type: 'string', description: 'Country' },
        contactIds:    { type: 'array', items: { type: 'string' }, description: 'Associated contact IDs' },
        note:          { type: 'string', description: 'Note/description' },
      },
    },
  },

  {
    name: 'mfr_update_service_object',
    description: 'Updates an existing service object in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'ServiceObject ID' },
        fields: { type: 'object', description: 'Field key-value pairs' },
      },
    },
  },

  // ── WRITE: ServiceRequests ─────────────────────────────────────────────────

  {
    name: 'mfr_create_service_request',
    description: 'Creates a new work order in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['title', 'customerId'],
      properties: {
        title:           { type: 'string', description: 'Work order title' },
        customerId:      { type: 'string', description: 'Company ID' },
        description:     { type: 'string', description: 'Description' },
        contactId:       { type: 'string', description: 'Contact ID' },
        serviceObjectId: { type: 'string', description: 'ServiceObject ID' },
        templateId:      { type: 'string', description: 'CreateFromServiceRequestTemplateId' },
      },
    },
  },

  {
    name: 'mfr_update_service_request',
    description: 'Updates an existing work order (status, description, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'ServiceRequest ID' },
        fields: { type: 'object', description: "Field key-value pairs, e.g. {\"Status\": \"eIsWorkDone\"}" },
      },
    },
  },

  {
    name: 'mfr_delete_service_request',
    description: 'Deletes a work order from mfr®. Irreversible!',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'ServiceRequest ID' } },
    },
  },

  // ── WRITE: Appointments ────────────────────────────────────────────────────

  {
    name: 'mfr_create_appointment',
    description: 'Creates a new appointment for a work order.',
    inputSchema: {
      type: 'object',
      required: ['serviceRequestId', 'startDateTime', 'endDateTime'],
      properties: {
        serviceRequestId: { type: 'string', description: 'ServiceRequest ID' },
        startDateTime:    { type: 'string', description: 'ISO 8601, e.g. 2026-03-10T09:00:00' },
        endDateTime:      { type: 'string', description: 'ISO 8601' },
        contactIds:       { type: 'array', items: { type: 'string' }, description: 'Technician IDs' },
        location:         { type: 'string', description: 'Location' },
      },
    },
  },

  {
    name: 'mfr_update_appointment',
    description: 'Updates an existing appointment (time, location, technicians, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id: { type: 'string', description: 'Appointment ID' },
        fields: { type: 'object', description: 'Field key-value pairs, e.g. {"StartDateTime": "2026-03-15T09:00:00", "Location": "Berlin"}' },
      },
    },
  },

  // ── WRITE: Webhooks ────────────────────────────────────────────────────────

  {
    name: 'mfr_create_webhook',
    description: 'Registers a webhook in mfr® — mfr® will push events to your callback URL (no polling needed). Known types: ServiceRequestStateChanged, ServiceRequestCreated, AppointmentCreated, AppointmentChanged, TimeEventCreated.',
    inputSchema: {
      type: 'object',
      required: ['webHookType', 'callbackUrl'],
      properties: {
        webHookType: { type: 'string', description: "Event type, e.g. \"ServiceRequestStateChanged\"" },
        callbackUrl: { type: 'string', description: "Callback URL" },
        externalId:  { type: 'string', description: "Optional external ID" },
      },
    },
  },

  {
    name: 'mfr_delete_webhook',
    description: 'Deletes a registered webhook from mfr®.',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Webhook ID' } },
    },
  },

  // ── Items ──────────────────────────────────────────────────────────────────

  {
    name: 'mfr_get_items',
    description: 'Reads items/materials from mfr®. Via Items endpoint or via expand="Items" on mfr_get_service_requests.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "e.g. \"ItemType\"" },
        select:  { type: 'string', description: "Limit fields" },
        top:     { type: 'number', description: 'Max results (default: 20)' },
        orderby: { type: 'string', description: 'Sort' },
      },
    },
  },

  {
    name: 'mfr_create_item',
    description: 'Creates a material item on a work order (parts used, labour hours, etc.).',
    inputSchema: {
      type: 'object',
      required: ['serviceRequestId', 'nameOrNumber'],
      properties: {
        serviceRequestId:     { type: 'string', description: 'ServiceRequest ID (required)' },
        nameOrNumber:         { type: 'string', description: 'Name or part number (required)' },
        quantityHours:        { type: 'string', description: 'Actual quantity (e.g. "2.00")' },
        plannedQuantityHours: { type: 'string', description: 'Planned quantity' },
        price:                { type: 'string', description: 'Unit price (e.g. "12.50")' },
        costs:                { type: 'string', description: 'Cost price' },
        discount:             { type: 'string', description: 'Discount % (e.g. "0.00")' },
        vat:                  { type: 'string', description: 'VAT (e.g. "0.19" for 19%)' },
        type:                 { type: 'string', description: 'Type: Equipment | Material | Labour | Travel' },
        itemTypeId:           { type: 'string', description: 'ItemType ID' },
        unitId:               { type: 'string', description: 'Unit ID' },
        unitString:           { type: 'string', description: 'Unit as text' },
        manufacture:          { type: 'string', description: 'Manufacturer/serial' },
        externalId:           { type: 'string', description: 'External ID' },
        note:                 { type: 'string', description: 'Note' },
        serviceObjectId:      { type: 'string', description: 'ServiceObject ID (optional, "0" = none)' },
      },
    },
  },

  {
    name: 'mfr_update_item',
    description: 'Updates a material item (quantity, price, note, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id:     { type: 'string', description: 'Item ID' },
        fields: { type: 'object', description: 'Field key-value pairs, e.g. {"QuantityHours": "3.00", "Price": "15.00"}' },
      },
    },
  },

  {
    name: 'mfr_delete_item',
    description: 'Deletes a material item from mfr®. Irreversible!',
    inputSchema: {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'string', description: 'Item ID' } },
    },
  },

  // ── Steps & Templates ──────────────────────────────────────────────────────

  {
    name: 'mfr_get_steps',
    description: 'Reads steps/checklist entries from mfr®. Contains IsDone, HasError, Type, Data (JSON fields).',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: "OData $filter, e.g. \"ServiceRequestId eq '67167551495'\"" },
        expand:  { type: 'string', description: "e.g. \"Attachments\"" },
        select:  { type: 'string', description: "Limit fields" },
        top:     { type: 'number', description: 'Max results (default: 50)' },
        orderby: { type: 'string', description: 'Sort (default: SortOrder asc)' },
      },
    },
  },

  {
    name: 'mfr_get_step_list_templates',
    description: 'Reads StepListTemplates from mfr®. Returns template IDs for creating work orders.',
    inputSchema: {
      type: 'object',
      properties: {
        expand: { type: 'string', description: "e.g. \"Steps\"" },
        top:    { type: 'number', description: 'Max results (default: 20)' },
      },
    },
  },

  {
    name: 'mfr_get_item_types',
    description: 'Reads item types/catalog. Returns ItemTypeId and UnitId values for mfr_create_item.',
    inputSchema: {
      type: 'object',
      properties: {
        expand: { type: 'string', description: "e.g. \"Unit\"" },
        filter: { type: 'string', description: 'OData $filter' },
        top:    { type: 'number', description: 'Max results (default: 50)' },
      },
    },
  },

  {
    name: 'mfr_get_cost_centers',
    description: 'Reads cost centers. Returns CostCenterId values for work orders.',
    inputSchema: {
      type: 'object',
      properties: { top: { type: 'number', description: 'Max results (default: 50)' } },
    },
  },

  // ── Offers ─────────────────────────────────────────────────────────────────

  {
    name: 'mfr_get_offers',
    description: 'Reads offers from mfr®. Navigation: Tags, Contacts, Documents, Qualifications, Destination (ServiceObject).',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        expand:  { type: 'string', description: "e.g. \"Tags,Contacts,Documents,Destination\"" },
        select:  { type: 'string', description: "Limit fields" },
        top:     { type: 'number', description: 'Max results (default: 10)' },
        orderby: { type: 'string', description: 'Sort' },
      },
    },
  },

  {
    name: 'mfr_create_offer',
    description: 'Creates a new offer in mfr®.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:        { type: 'string', description: 'Offer name (required)' },
        externalId:  { type: 'string', description: 'External ID' },
        description: { type: 'string', description: 'Description' },
      },
    },
  },

  {
    name: 'mfr_update_offer',
    description: 'Updates an existing offer.',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id:     { type: 'string', description: 'Offer ID' },
        fields: { type: 'object', description: 'Field key-value pairs' },
      },
    },
  },

  // ── Invoices ───────────────────────────────────────────────────────────────

  {
    name: 'mfr_get_invoices',
    description: 'Reads invoices. URI field contains the direct PDF download link.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        select:  { type: 'string', description: "Limit fields, e.g. \"Id,InvoiceId,InvoiceBalance,DueDate,URI,InvoiceState\"" },
        top:     { type: 'number', description: 'Max results (default: 20)' },
        orderby: { type: 'string', description: "Sort (default: DateOfCreation desc)" },
      },
    },
  },

  // ── Projects ───────────────────────────────────────────────────────────────

  {
    name: 'mfr_get_projects',
    description: 'Reads projects. Projects group multiple work orders with budget tracking.',
    inputSchema: {
      type: 'object',
      properties: {
        filter:  { type: 'string', description: 'OData $filter' },
        expand:  { type: 'string', description: "e.g. \"Tags\"" },
        select:  { type: 'string', description: "Limit fields" },
        top:     { type: 'number', description: 'Max results (default: 10)' },
        orderby: { type: 'string', description: 'Sort' },
      },
    },
  },

  {
    name: 'mfr_create_project',
    description: 'Creates a new project with optional time + material budget.',
    inputSchema: {
      type: 'object',
      required: ['name'],
      properties: {
        name:           { type: 'string', description: 'Project name (required)' },
        externalId:     { type: 'string', description: 'External ID' },
        customerId:     { type: 'string', description: 'Company ID' },
        budgetTime:     { type: 'string', description: 'Time budget in hours (e.g. "65")' },
        budgetMaterial: { type: 'string', description: 'Material budget' },
      },
    },
  },

  {
    name: 'mfr_update_project',
    description: 'Updates an existing project (name, budget, IsClosed, etc.).',
    inputSchema: {
      type: 'object',
      required: ['id', 'fields'],
      properties: {
        id:     { type: 'string', description: 'Project ID' },
        fields: { type: 'object', description: 'Field key-value pairs, e.g. {"IsClosed": true, "BudgetTime": "80"}' },
      },
    },
  },

  // ── Generate reports ───────────────────────────────────────────────────────

  {
    name: 'mfr_generate_report',
    description: 'Generates a report/protocol for a ServiceRequest. Returns hash + ready download URL. Download with GET {downloadUrl} using Basic Auth.',
    inputSchema: {
      type: 'object',
      required: ['serviceRequestId', 'reportDefinitionId'],
      properties: {
        serviceRequestId:   { type: 'string', description: 'ServiceRequest ID' },
        reportDefinitionId: { type: 'string', description: 'Report definition ID' },
      },
    },
  },
];

/**
 * Dispatch a tool call.
 *
 * @param {string} name       — tool name
 * @param {object} args       — tool input
 * @param {object} credentials — { username, password } — required for every call
 */
export async function handleTool(name, args, credentials) {
  switch (name) {

    // ── READ ──────────────────────────────────────────────────────────────────

    case 'mfr_get_service_requests': {
      const url = buildODataUrl('ServiceRequests', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 10, orderby: args.orderby });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_service_objects': {
      const url = buildODataUrl('ServiceObjects', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 20, orderby: args.orderby });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_companies': {
      const url = buildODataUrl('Companies', { filter: args.filter, search: args.search, expand: args.expand, select: args.select, top: args.top ?? 10 });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_contacts': {
      const url = buildODataUrl('Contacts', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 20 });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_appointments': {
      const url = buildODataUrl('Appointments', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 20, orderby: args.orderby ?? 'StartDateTime asc' });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_users': {
      const url = buildODataUrl('Users', { filter: args.filter, expand: args.expand, top: args.top ?? 50 });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_documents': {
      const url = buildODataUrl('Documents', { filter: args.filter, expand: args.expand, top: args.top ?? 20, orderby: args.orderby ?? 'DateModified desc' });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_time_events': {
      const url = buildODataUrl('TimeEvents', { filter: args.filter, expand: args.expand, top: args.top ?? 20, orderby: args.orderby });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_tags': {
      const url = buildODataUrl('Tags', { filter: args.filter, top: args.top ?? 50 });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_webhooks': {
      const data = await mfrFetch('/odata/WebHooks', credentials);
      return data?.value ?? data;
    }

    // ── WRITE: Companies & Contacts ───────────────────────────────────────────

    case 'mfr_create_company': {
      if (!args.name) throw new Error('name is required');
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
      return await mfrFetch('/odata/Companies', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_company': {
      if (!args.id)     throw new Error('id is required');
      if (!args.fields) throw new Error('fields is required');
      const data = await mfrFetch(`/odata/Companies(${args.id}L)`, credentials, { method: 'PUT', body: JSON.stringify(args.fields) });
      return data ?? { success: true, id: args.id };
    }

    case 'mfr_create_contact': {
      if (!args.lastName) throw new Error('lastName is required');
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
      return await mfrFetch('/odata/Contacts', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_contact': {
      if (!args.id)     throw new Error('id is required');
      if (!args.fields) throw new Error('fields is required');
      const data = await mfrFetch(`/odata/Contacts(${args.id}L)`, credentials, { method: 'PUT', body: JSON.stringify(args.fields) });
      return data ?? { success: true, id: args.id };
    }

    // ── WRITE: ServiceObjects ─────────────────────────────────────────────────

    case 'mfr_create_service_object': {
      if (!args.name)      throw new Error('name is required');
      if (!args.companyId) throw new Error('companyId is required');
      const body = { Name: args.name, CompanyId: args.companyId };
      if (args.externalId) body.ExternalId = args.externalId;
      if (args.note)       body.Note = args.note;
      if (args.addressString || args.postal || args.city) {
        body.Location = {};
        if (args.addressString) body.Location.AddressString = args.addressString;
        if (args.postal)        body.Location.Postal = args.postal;
        if (args.city)          body.Location.City = args.city;
        if (args.country)       body.Location.Country = args.country;
      }
      if (args.contactIds?.length) body.Contacts = args.contactIds.map(id => ({ Id: id }));
      return await mfrFetch('/odata/ServiceObjects', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_service_object': {
      if (!args.id)     throw new Error('id is required');
      if (!args.fields) throw new Error('fields is required');
      const data = await mfrFetch(`/odata/ServiceObjects(${args.id}L)`, credentials, { method: 'PUT', body: JSON.stringify(args.fields) });
      return data ?? { success: true, id: args.id };
    }

    // ── WRITE: ServiceRequests ────────────────────────────────────────────────

    case 'mfr_create_service_request': {
      if (!args.title)      throw new Error('title is required');
      if (!args.customerId) throw new Error('customerId is required');
      const body = { Subject: args.title, CompanyId: args.customerId };
      if (args.description)     body.Description = args.description;
      if (args.contactId)       body.ContactId = args.contactId;
      if (args.serviceObjectId) body.ServiceObjectId = args.serviceObjectId;
      if (args.templateId)      body.CreateFromServiceRequestTemplateId = args.templateId;
      return await mfrFetch('/mfr/ServiceRequest/Deep', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_service_request': {
      if (!args.id) throw new Error('id is required');
      if (!args.fields || typeof args.fields !== 'object') throw new Error('fields must be an object');
      const data = await mfrFetch(`/mfr/ServiceRequest/${args.id}`, credentials, { method: 'PUT', body: JSON.stringify(args.fields) });
      return data ?? { success: true, id: args.id };
    }

    case 'mfr_delete_service_request': {
      if (!args.id) throw new Error('id is required');
      return await mfrFetch(`/odata/ServiceRequests(${args.id}L)`, credentials, { method: 'DELETE' });
    }

    // ── WRITE: Appointments ───────────────────────────────────────────────────

    case 'mfr_create_appointment': {
      if (!args.serviceRequestId) throw new Error('serviceRequestId is required');
      if (!args.startDateTime)    throw new Error('startDateTime is required');
      if (!args.endDateTime)      throw new Error('endDateTime is required');
      const body = { ServiceRequestId: args.serviceRequestId, StartDateTime: args.startDateTime, EndDateTime: args.endDateTime };
      if (args.location) body.Location = args.location;
      if (args.contactIds?.length) body.Contacts = args.contactIds.map(id => ({ ContactId: id }));
      return await mfrFetch('/odata/Appointments', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_appointment': {
      if (!args.id)     throw new Error('id is required');
      if (!args.fields) throw new Error('fields is required');
      const data = await mfrFetch(`/odata/Appointments(${args.id}L)`, credentials, { method: 'PUT', body: JSON.stringify(args.fields) });
      return data ?? { success: true, id: args.id };
    }

    // ── WRITE: Webhooks ───────────────────────────────────────────────────────

    case 'mfr_create_webhook': {
      if (!args.webHookType) throw new Error('webHookType is required');
      if (!args.callbackUrl) throw new Error('callbackUrl is required');
      const body = { WebHookType: args.webHookType, CallbackUrl: args.callbackUrl };
      if (args.externalId) body.ExternalId = args.externalId;
      return await mfrFetch('/odata/WebHooks', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_delete_webhook': {
      if (!args.id) throw new Error('id is required');
      return await mfrFetch(`/odata/WebHooks(${args.id}L)`, credentials, { method: 'DELETE' });
    }

    // ── Items ─────────────────────────────────────────────────────────────────

    case 'mfr_get_items': {
      const url = buildODataUrl('Items', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 20, orderby: args.orderby });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_create_item': {
      if (!args.serviceRequestId) throw new Error('serviceRequestId is required');
      if (!args.nameOrNumber)     throw new Error('nameOrNumber is required');
      const body = { ServiceRequestId: args.serviceRequestId, NameOrNumber: args.nameOrNumber, ServiceObjectId: args.serviceObjectId ?? '0' };
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
      return await mfrFetch('/odata/Items', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_item': {
      if (!args.id)     throw new Error('id is required');
      if (!args.fields) throw new Error('fields is required');
      const data = await mfrFetch(`/odata/Items(${args.id}L)`, credentials, { method: 'PUT', body: JSON.stringify({ Id: args.id, ...args.fields }) });
      return data ?? { success: true, id: args.id };
    }

    case 'mfr_delete_item': {
      if (!args.id) throw new Error('id is required');
      return await mfrFetch(`/odata/Items(${args.id}L)`, credentials, { method: 'DELETE' });
    }

    // ── Steps & Catalog ───────────────────────────────────────────────────────

    case 'mfr_get_steps': {
      const url = buildODataUrl('Steps', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 50, orderby: args.orderby ?? 'SortOrder asc' });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_step_list_templates': {
      const url = buildODataUrl('StepListTemplates', { expand: args.expand, top: args.top ?? 20 });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_item_types': {
      const url = buildODataUrl('ItemTypes', { expand: args.expand, filter: args.filter, top: args.top ?? 50 });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_get_cost_centers': {
      const url = buildODataUrl('CostCenters', { top: args.top ?? 50 });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    // ── Offers ────────────────────────────────────────────────────────────────

    case 'mfr_get_offers': {
      const url = buildODataUrl('Offers', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 10, orderby: args.orderby });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_create_offer': {
      if (!args.name) throw new Error('name is required');
      const body = { Name: args.name };
      if (args.externalId)  body.ExternalId = args.externalId;
      if (args.description) body.Description = args.description;
      return await mfrFetch('/odata/Offers', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_offer': {
      if (!args.id)     throw new Error('id is required');
      if (!args.fields) throw new Error('fields is required');
      const data = await mfrFetch(`/odata/Offers(${args.id}L)`, credentials, { method: 'PUT', body: JSON.stringify(args.fields) });
      return data ?? { success: true, id: args.id };
    }

    // ── Invoices ──────────────────────────────────────────────────────────────

    case 'mfr_get_invoices': {
      const url = buildODataUrl('Invoices', { filter: args.filter, select: args.select, top: args.top ?? 20, orderby: args.orderby ?? 'DateOfCreation desc' });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    // ── Projects ──────────────────────────────────────────────────────────────

    case 'mfr_get_projects': {
      const url = buildODataUrl('Projects', { filter: args.filter, expand: args.expand, select: args.select, top: args.top ?? 10, orderby: args.orderby });
      const data = await mfrFetch(url, credentials);
      return data?.value ?? data;
    }

    case 'mfr_create_project': {
      if (!args.name) throw new Error('name is required');
      const body = { Name: args.name };
      if (args.externalId)     body.ExternalId = args.externalId;
      if (args.customerId)     body.CustomerId = args.customerId;
      if (args.budgetTime)     body.BudgetTime = args.budgetTime;
      if (args.budgetMaterial) body.BudgetMaterial = args.budgetMaterial;
      return await mfrFetch('/odata/Projects', credentials, { method: 'POST', body: JSON.stringify(body) });
    }

    case 'mfr_update_project': {
      if (!args.id)     throw new Error('id is required');
      if (!args.fields) throw new Error('fields is required');
      const data = await mfrFetch(`/odata/Projects(${args.id}L)`, credentials, { method: 'PUT', body: JSON.stringify(args.fields) });
      return data ?? { success: true, id: args.id };
    }

    // ── Generate reports ──────────────────────────────────────────────────────

    case 'mfr_generate_report': {
      if (!args.serviceRequestId)   throw new Error('serviceRequestId is required');
      if (!args.reportDefinitionId) throw new Error('reportDefinitionId is required');
      const data = await mfrFetch(
        `/odata/ServiceRequests(${args.serviceRequestId}L)/GenerateReportHash`,
        credentials,
        { method: 'POST', body: JSON.stringify({ reportDefinitionId: args.reportDefinitionId }) }
      );
      const hash = data?.value ?? data;
      return {
        hash,
        downloadUrl: `${getBaseUrl()}/System/CustomerReport/${hash}`,
        note: 'Download with GET {downloadUrl} using Basic Auth.',
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
