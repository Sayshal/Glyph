/**
 * Build a `{kind, value, scope}` reference schema field.
 * @param {object} [options] Passed through to the wrapping SchemaField.
 * @returns {foundry.data.fields.SchemaField} The reference field.
 */
export function createReferenceField(options = {}) {
  const fields = foundry.data.fields;
  return new fields.SchemaField(
    {
      kind: new fields.StringField({ required: true, blank: false, choices: ['uuid', 'tag', 'context'] }),
      value: new fields.StringField({ required: true, blank: false }),
      scope: new fields.StringField({ required: false, blank: true })
    },
    options
  );
}
