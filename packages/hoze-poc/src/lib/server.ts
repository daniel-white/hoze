import express, { json, Request, Response } from 'express';
import z, { ZodNever, ZodObject, ZodRawShape } from 'zod';

/*
 * Hoze is a library for building type-safe, composable, and testable HTTP APIs.
 */

// Framework code

const HozeRequestSchema = z.object({
  pathParameters: z.object({}),
  queryStringParameters: z.object({}),
  headerParameters: z.object({}),
  body: z.unknown(),
});

type HozeRequest = z.infer<typeof HozeRequestSchema>;

const HozeResponseSchema = z.object({
  statusCode: z.number(),
  headers: z.object({}).optional(),
  body: z.unknown(),
});

type HozeResponse = z.infer<typeof HozeResponseSchema>;

export type HozeHandler<
  TRequest extends HozeRequest = HozeRequest,
  TResponse extends HozeResponse = HozeResponse
> = (request: TRequest) => Promise<TResponse>;

export type HozeBeforeMiddleware<TRequest extends HozeRequest = HozeRequest> = (
  request: Request,
  response: Response,
  hozeRequest: TRequest
) => Promise<void>;

export type HozeAfterMiddleware<
  TRequest extends HozeRequest = HozeRequest,
  TResponse extends HozeResponse = HozeResponse
> = (
  request: Request,
  response: Response,
  hozeRequest: TRequest,
  hozeResponse: TResponse
) => Promise<void>;

export type HozeOperation<
  TRequest extends HozeRequest = HozeRequest,
  TResponse extends HozeResponse = HozeResponse
> = {
  requestSchema: typeof HozeRequestSchema;
  beforeMiddleware: HozeBeforeMiddleware<TRequest>[];
  handler: HozeHandler<TRequest, TResponse>;
  responseSchema: typeof HozeResponseSchema;
  afterMiddleware: HozeAfterMiddleware<TRequest, TResponse>[];
};

function bindRequest(request: Request, operation: HozeOperation): HozeRequest {
  // TODO safe parse, & problem details
  return operation.requestSchema.parse({
    pathParameters: request.params,
    headerParameters: request.headers,
    queryStringParameters: request.query,
    body:
      (operation.requestSchema.shape.body as unknown) instanceof ZodNever
        ? undefined
        : request.body,
  });
}

function bindResponse(
  response: Response,
  operation: HozeOperation,
  hozeResponse: HozeResponse
) {
  const parsedResponse = operation.responseSchema.parse(hozeResponse);
  for (const [header, value] of Object.entries(hozeResponse.headers ?? {})) {
    response.setHeader(header, String(value));
  }
  response.status(parsedResponse.statusCode);
  response.contentType('application/json');
  response.send(parsedResponse.body);
  response.end();
}

function bindError(response: Response) {
  // TODO problem details
  response.status(500);
  response.contentType('application/json+problem');
  response.end();
}

async function invokeOperation(
  request: Request,
  response: Response,
  operation: HozeOperation
) {
  try {
    const hozeRequest = bindRequest(request, operation);

    for (const beforeMiddleware of operation.beforeMiddleware) {
      await beforeMiddleware(request, response, hozeRequest);
    }

    const hozeResponse = await operation.handler(hozeRequest);

    for (const afterMiddleware of operation.afterMiddleware) {
      await afterMiddleware(request, response, hozeRequest, hozeResponse);
    }

    bindResponse(response, operation, hozeResponse);
  } catch (error: unknown) {
    console.error(error);
    bindError(response);
  }
}

// Petstore API, eventually should be code generated

const PetStatusSchema = z.enum(['available', 'pending', 'sold']);

const NewPetSchema = z.object({
  name: z.string(),
  age: z.number().min(0),
  status: PetStatusSchema,
});

const PetSchema = NewPetSchema.extend({
  id: z.number().int().min(0),
});

const PetListSchema = z.array(PetSchema);

const createPetRequestSchema = HozeRequestSchema.extend({
  body: NewPetSchema,
  headerParameters: z.object({
    'content-type': z.literal('application/json'),
  }),
});

type CreatePetRequest = z.infer<typeof createPetRequestSchema>;

const createPet200ResponseSchema = HozeResponseSchema.extend({
  statusCode: z.literal(200),
  body: PetSchema,
});

const createPet405ResponseSchema = HozeResponseSchema.extend({
  statusCode: z.literal(405),
});

const createPetResponseSchema = z.union([
  createPet200ResponseSchema,
  createPet405ResponseSchema,
]);

type CreatePetResponse = z.infer<typeof createPetResponseSchema>;

const createPetOperation: HozeOperation<CreatePetRequest, CreatePetResponse> = {
  requestSchema: createPetRequestSchema as unknown as typeof HozeRequestSchema,
  beforeMiddleware: [],
  handler: async ({ body }) => {
    return {
      statusCode: 200,
      body: {
        ...body,
        id: 27,
        j: 1,
      },
    };
  },
  responseSchema:
    createPetResponseSchema as unknown as typeof HozeResponseSchema,
  afterMiddleware: [],
};

const getPetRequestSchema = HozeRequestSchema.extend({
  pathParameters: z.object({
    petId: z.coerce.number().int().min(0),
  }),
});

type GetPetRequest = z.infer<typeof getPetRequestSchema>;

const getPet200ResponseSchema = HozeResponseSchema.extend({
  statusCode: z.literal(200),
  body: PetSchema,
});

const getPet404ResponseSchema = HozeResponseSchema.extend({
  statusCode: z.literal(404),
});

const getPetResponseSchema = z.union([
  getPet200ResponseSchema,
  getPet404ResponseSchema,
]);

type GetPetResponse = z.infer<typeof getPetResponseSchema>;

const getPetOperation: HozeOperation<GetPetRequest, GetPetResponse> = {
  requestSchema: getPetRequestSchema as unknown as typeof HozeRequestSchema,
  beforeMiddleware: [],
  handler: async ({ pathParameters, body }) => {
    return {
      statusCode: 200,
      body: {
        id: pathParameters.petId,
        age: 2,
        status: 'available',
        name: 'Fido',
      },
    };
  },
  responseSchema: getPetResponseSchema as unknown as typeof HozeResponseSchema,
  afterMiddleware: [],
};

// Express server

const app = express();

app.use(json());

app.post('/pets', (req, res) => {
  invokeOperation(req, res, createPetOperation as unknown as HozeOperation);
});

app.get('/pets/:petId', (req, res) => {
  invokeOperation(req, res, getPetOperation as unknown as HozeOperation);
});

app.listen(3000);
