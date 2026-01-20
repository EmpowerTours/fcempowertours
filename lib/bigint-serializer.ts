// lib/bigint-serializer.ts
export function safeBigIntStringify(obj: any): string {
  return JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  );
}

export function logSafe(...args: any[]) {
  console.log(...args.map(arg => 
    typeof arg === 'bigint' ? arg.toString() : arg
  ));
}
