import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { SAFE_USER_PROJECTION } from 'src/helper/projection/user.projection';
import { AppUtilService } from 'src/helper/service/app-util.service';
import {
  applyAuditLocals,
  auditContext,
} from 'src/helper/service/audit-context';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import {
  itemDisplayName,
  itemUnitPrice,
} from 'src/helper/catalog/item-derived';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import type {
  ReferenceHistoryEntry,
  ReferenceKpis,
} from 'src/helper/types/reference.type';
import { HistoryActionEnum } from 'src/schema/admin/admin.dto';
import { categoryHistorySchemaName } from 'src/schema/catalog/category-history.schema';
import {
  Category,
  categorySchemaName,
} from 'src/schema/catalog/category.schema';
import { currencyHistorySchemaName } from 'src/schema/catalog/currency-history.schema';
import {
  Currency,
  currencySchemaName,
} from 'src/schema/catalog/currency.schema';
import {
  ItemCategory,
  itemCategorySchemaName,
} from 'src/schema/catalog/item-category.schema';
import {
  ItemHistory,
  itemHistorySchemaName,
} from 'src/schema/catalog/item-history.schema';
import {
  ItemSubCategory,
  itemSubCategorySchemaName,
} from 'src/schema/catalog/item-sub-category.schema';
import { Item, itemSchemaName } from 'src/schema/catalog/item.schema';
import { serviceTypeHistorySchemaName } from 'src/schema/catalog/service-type-history.schema';
import {
  ServiceType,
  serviceTypeSchemaName,
} from 'src/schema/catalog/service-type.schema';
import { serviceHistorySchemaName } from 'src/schema/catalog/service-history.schema';
import { Service, serviceSchemaName } from 'src/schema/catalog/service.schema';
import { subCategoryHistorySchemaName } from 'src/schema/catalog/sub-category-history.schema';
import {
  SubCategory,
  subCategorySchemaName,
} from 'src/schema/catalog/sub-category.schema';
import { orderItemSchemaName } from 'src/schema/order/order-item.schema';
import { paymentSchemaName } from 'src/schema/payment/payment.schema';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCurrencyDto } from './dto/create-currency.dto';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateServiceTypeDto } from './dto/create-service-type.dto';
import { CreateServiceDto } from './dto/create-service.dto';
import { CreateSubCategoryDto } from './dto/create-sub-category.dto';
import { FindCategoryDto } from './dto/find-category.dto';
import { FindCurrencyDto } from './dto/find-currency.dto';
import { FindItemDto } from './dto/find-item.dto';
import { FindServiceTypeDto } from './dto/find-service-type.dto';
import { FindServiceDto } from './dto/find-service.dto';
import { FindSubCategoryDto } from './dto/find-sub-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateCurrencyDto } from './dto/update-currency.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { UpdateServiceTypeDto } from './dto/update-service-type.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { UpdateSubCategoryDto } from './dto/update-sub-category.dto';

/** What every catalogue detail read carries, whatever the collection. */
type CatalogueDetail = Record<string, unknown> & {
  reference: string;
  history: ReferenceHistoryEntry[];
};

/** One item, with its links resolved and its trail. */
export type ItemDetail = CatalogueDetail & { orderItemCount: number };

/** One service, service type, category or sub category, with its trail. */
export type CatalogueRowDetail = CatalogueDetail & { itemCount: number };

/** One currency: what is priced in it, what has been taken in it. */
export type CurrencyDetail = CatalogueDetail & {
  itemCount: number;
  paymentCount: number;
};

/**
 * How much of the trail a detail read returns. Catalogue rows are written
 * rarely, so this is a guard against a pathological row rather than a page
 * size anyone will hit.
 */
const CATALOGUE_HISTORY_LIMIT = 100;

/**
 * The catalogue: what the business sells, and what it charges for it.
 *
 * Six collections — items, services, service types, categories, sub
 * categories and currencies — read and written the same five ways: a filtered
 * page, its headline counts, one row by reference with its audit trail, an
 * add, and an edit.
 *
 * They are all the same shape of thing, so the machinery is written once as
 * the private helpers at the top and each collection below supplies only what
 * differs: which fields its search looks at, what its usage figure counts,
 * and which links it resolves. Items are the exception and get their own
 * pipeline — they are the only collection with foreign keys of their own.
 *
 * Nothing here takes or returns a mongo id as an address. Every row is
 * reached by its `reference`, and an item names its service, service type and
 * currency by reference too, so a 24-character id never has to reach a URL,
 * a browser or a support conversation.
 */
@Injectable()
export class CatalogueService {
  private readonly logger = new Logger(CatalogueService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    private readonly codeService: CodeGeneratorService,
    private readonly historyLabelService: HistoryLabelService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,

    @InjectModel(Item.name) private readonly itemModel: Model<Item>,
    @InjectModel(Service.name) private readonly serviceModel: Model<Service>,
    @InjectModel(Currency.name)
    private readonly currencyModel: Model<Currency>,
    @InjectModel(Category.name) private readonly categoryModel: Model<Category>,
    @InjectModel(ServiceType.name)
    private readonly serviceTypeModel: Model<ServiceType>,
    @InjectModel(SubCategory.name)
    private readonly subCategoryModel: Model<SubCategory>,
    @InjectModel(ItemCategory.name)
    private readonly itemCategoryModel: Model<ItemCategory>,
    @InjectModel(ItemSubCategory.name)
    private readonly itemSubCategoryModel: Model<ItemSubCategory>,
    @InjectModel(ItemHistory.name)
    private readonly itemHistoryModel: Model<ItemHistory>,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log} is`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  /** `[platform] phone`, the prefix every log line here opens with. */
  private get logBase() {
    return `[${this.req.data.platform}] ${this.req.user.phone}`;
  }

  /**
   * The filters behind one catalogue list and its KPIs, built once so the two
   * can never disagree.
   *
   * `status` comes back on its own rather than merged into `base`: the KPI
   * status breakdown counts both statuses over everything else, so it needs
   * the filter without it.
   */
  private buildFilter(
    query: { q?: string; isActive?: boolean },
    searchFields: string[],
  ) {
    const base: Record<string, unknown> = {};

    if (query.q) {
      const rx = new RegExp(this.appUtilService.escapeRegex(query.q), 'i');
      base.$or = searchFields.map((field) => ({ [field]: rx }));
    }

    const status =
      typeof query.isActive === 'boolean'
        ? { isActive: query.isActive }
        : undefined;

    return { base, status };
  }

  /**
   * One page of a catalogue collection, in the envelope the panel reads.
   *
   * `total` is the count under the same filters, not the collection size, so
   * the pager agrees with what is on screen.
   */
  private async listPage<TDoc>(
    model: Model<TDoc>,
    where: Record<string, unknown>,
    { page, size, sort }: { page: number; size: number; sort?: string },
  ) {
    const skip = (page - 1) * size;
    const total = await model.countDocuments(where);
    const data = await model
      .find(where)
      .sort(this.appUtilService.parseSortParam(sort))
      .skip(skip)
      .limit(size)
      .lean();

    const totalPages = Math.ceil(total / size);
    return { total, data, nextPage: page < totalPages ? page + 1 : null };
  }

  /**
   * Headline counts over one catalogue list's filters.
   *
   * `total` respects every filter, `isActive` included. The three status
   * figures come from `byStatus`, which drops `isActive` so the status tab
   * strip keeps its counts whichever tab is selected — which is why `total`
   * and `byStatus.all` differ only when the caller asked for one status.
   */
  private async countKpis<TDoc>(
    model: Model<TDoc>,
    base: Record<string, unknown>,
    status?: Record<string, unknown>,
  ): Promise<ReferenceKpis> {
    const [total, byStatus] = await Promise.all([
      model.countDocuments({ ...base, ...status }),
      model.aggregate<{ _id: boolean; n: number }>([
        { $match: base },
        { $group: { _id: '$isActive', n: { $sum: 1 } } },
      ]),
    ]);

    const statusRow = (isActive: boolean) =>
      byStatus.find((row) => row._id === isActive)?.n ?? 0;
    const active = statusRow(true);
    const inactive = statusRow(false);

    return {
      total,
      totalActive: active,
      totalInactive: inactive,
      byStatus: { all: active + inactive, active, inactive },
    };
  }

  /**
   * The audit trail, as a `$lookup` stage.
   *
   * `changedFields` is stored as an object keyed by field name, so it is
   * turned into a flat array a timeline can render directly. The stored
   * `snapshot` is never projected — it is there for a rebuild, not for a
   * reader.
   */
  private historyStage(
    collection: string,
    foreignField: string,
  ): PipelineStage {
    return {
      $lookup: {
        as: 'history',
        from: collection,
        localField: '_id',
        foreignField,
        pipeline: [
          { $sort: { createdAt: -1 } },
          { $limit: CATALOGUE_HISTORY_LIMIT },
          {
            $lookup: {
              as: 'changedByUser',
              from: 'user',
              localField: 'changedBy',
              foreignField: '_id',
              pipeline: [{ $project: SAFE_USER_PROJECTION }],
            },
          },
          {
            $unwind: {
              path: '$changedByUser',
              preserveNullAndEmptyArrays: true,
            },
          },
          {
            $project: {
              action: 1,
              reason: 1,
              createdAt: 1,
              changedBy: 1,
              changedByUser: 1,
              changes: {
                $map: {
                  as: 'change',
                  input: {
                    $objectToArray: { $ifNull: ['$changedFields', {}] },
                  },
                  in: {
                    field: '$$change.k',
                    from: '$$change.v.from',
                    to: '$$change.v.to',
                  },
                },
              },
            },
          },
        ],
      },
    };
  }

  /**
   * Counts the rows of another collection that point at this one, as a pair
   * of stages. A count, not the rows themselves: the detail panel needs the
   * figure to warn before a deactivation, not a list it would have to page.
   */
  private usageStages(input: {
    as: string;
    from: string;
    foreignField: string;
    countAs: string;
  }): PipelineStage[] {
    return [
      {
        $lookup: {
          as: input.as,
          from: input.from,
          localField: '_id',
          foreignField: input.foreignField,
          pipeline: [{ $count: 'n' }],
        },
      },
      {
        $addFields: {
          [input.countAs]: { $ifNull: [{ $first: `$${input.as}.n` }, 0] },
        },
      },
    ];
  }

  /**
   * One catalogue row by its reference: the row, its usage figures, whatever
   * it links to, and its audit trail — everything the detail panel shows, in
   * one round trip.
   */
  private async findDetail<TDetail extends CatalogueDetail>(input: {
    model: Model<any>;
    reference: string;
    /** The schema the history belongs to, so foreign keys can be labelled. */
    sourceModel: string;
    historyCollection: string;
    historyForeignField: string;
    notFound: string;
    /** Usage counts and link resolution, before the trail is attached. */
    stages?: PipelineStage[];
    /** Working fields to drop from the response. */
    hide?: Record<string, 0>;
  }): Promise<TDetail> {
    const code = input.reference.trim().toUpperCase();

    const [row] = await input.model.aggregate<TDetail>([
      { $match: { reference: code } },
      { $limit: 1 },
      ...(input.stages ?? []),
      this.historyStage(input.historyCollection, input.historyForeignField),
      ...(input.hide ? [{ $project: input.hide }] : []),
    ]);

    if (!row) {
      this.logger.error(`${this.logBase} unknown reference ${code}`);
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: input.notFound,
      });
    }

    // Without this a foreign key in the trail reads as a raw id — an item's
    // service change would say `6a58…53d → 6a58…53e` rather than
    // `Wash and Fold → Dry Cleaning`.
    await this.historyLabelService.labelChanges(input.sourceModel, row.history);

    this.logger.log(`${this.logBase} has retrieved ${code}`);
    return row;
  }

  /**
   * Reads one row by its reference, or says it does not exist.
   *
   * Every single-row write goes through here, so the 24-character mongo id
   * never has to leave the API.
   */
  private async resolve<TDoc>(
    model: Model<TDoc>,
    reference: string,
    label: string,
  ) {
    const code = reference.trim().toUpperCase();
    const row = await model.findOne({ reference: code } as never);

    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: `${label} not found`,
      });
    }

    return row;
  }

  /**
   * Refuses a name already taken by another row.
   *
   * `exclude` is the row being edited: renaming something to what it is
   * already called is not a conflict.
   */
  private async assertNameFree<TDoc>(
    model: Model<TDoc>,
    field: string,
    value: string,
    message: string,
    exclude?: Types.ObjectId,
  ) {
    const where: Record<string, unknown> = { [field]: value };
    if (exclude) where._id = { $ne: exclude };

    if (await model.exists(where as never)) {
      throw new ConflictException({ code: 'CONFLICT', message });
    }
  }

  /* ---------------------------------------------------------------------- *
   * Services — what is done to a garment: Wash and Fold, Wash and Iron.
   * ---------------------------------------------------------------------- */

  async findAllServices({ page, size, ...query }: FindServiceDto) {
    this.can('READ', 'Service');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'serviceName',
      'description',
    ]);
    const result = await this.listPage(
      this.serviceModel,
      { ...base, ...status },
      { page, size, sort: query.sort },
    );

    this.logger.log(`${this.logBase} has successfully retrieve all services`);
    return result;
  }

  async getServiceKpis(
    query: Omit<FindServiceDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'Service');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'serviceName',
      'description',
    ]);
    const kpis = await this.countKpis(this.serviceModel, base, status);

    this.logger.log(`${this.logBase} has retrieved service kpis`);
    return kpis;
  }

  async findServiceByReference(reference: string): Promise<CatalogueRowDetail> {
    this.can('READ', 'Service');

    return await this.findDetail<CatalogueRowDetail>({
      reference,
      model: this.serviceModel,
      sourceModel: Service.name,
      notFound: 'Service not found',
      historyForeignField: 'serviceId',
      historyCollection: serviceHistorySchemaName,
      stages: this.usageStages({
        as: 'items',
        from: itemSchemaName,
        countAs: 'itemCount',
        foreignField: 'serviceId',
      }),
      hide: { items: 0 },
    });
  }

  async createService(data: CreateServiceDto) {
    this.can('CREATE', 'Service');

    const actorId = new Types.ObjectId(this.req.user.userId);
    await this.assertNameFree(
      this.serviceModel,
      'serviceName',
      data.serviceName,
      'A service with this name already exists',
    );

    const reference = await this.codeService.generateServiceReference();
    const service = new this.serviceModel({ ...data, reference });

    // Audit fields go on `$locals` before the save: that is the only thing
    // the history hook can read on a create, since a save carries no query
    // options for the reason to travel in.
    applyAuditLocals(service, this.req, actorId);
    await service.save();

    this.logger.log(`${this.logBase} created service ${reference}`);
    return service;
  }

  /**
   * Written with `findOneAndUpdate` and an audit context, which is the only
   * path that diffs the previous row against the update — a `save()` here
   * would leave a history entry saying a change happened but not what.
   */
  async updateService(reference: string, data: UpdateServiceDto) {
    this.can('UPDATE', 'Service');

    const actorId = new Types.ObjectId(this.req.user.userId);
    const service = await this.resolve(this.serviceModel, reference, 'Service');

    if (data.serviceName) {
      await this.assertNameFree(
        this.serviceModel,
        'serviceName',
        data.serviceName,
        'A service with this name already exists',
        service._id,
      );
    }

    const updated = await this.serviceModel.findOneAndUpdate(
      { _id: service._id },
      { ...data },
      {
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never,
    );

    this.logger.log(`${this.logBase} updated service ${service.reference}`);
    return updated;
  }

  /* ---------------------------------------------------------------------- *
   * Service types — how thoroughly it is done: Basic, Heavy, Premium.
   * ---------------------------------------------------------------------- */

  async findAllServiceTypes({ page, size, ...query }: FindServiceTypeDto) {
    this.can('READ', 'ServiceType');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'serviceTypeName',
      'description',
    ]);
    const result = await this.listPage(
      this.serviceTypeModel,
      { ...base, ...status },
      { page, size, sort: query.sort },
    );

    this.logger.log(
      `${this.logBase} has successfully retrieve all service types`,
    );
    return result;
  }

  async getServiceTypeKpis(
    query: Omit<FindServiceTypeDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'ServiceType');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'serviceTypeName',
      'description',
    ]);
    const kpis = await this.countKpis(this.serviceTypeModel, base, status);

    this.logger.log(`${this.logBase} has retrieved service type kpis`);
    return kpis;
  }

  async findServiceTypeByReference(
    reference: string,
  ): Promise<CatalogueRowDetail> {
    this.can('READ', 'ServiceType');

    return await this.findDetail<CatalogueRowDetail>({
      reference,
      model: this.serviceTypeModel,
      sourceModel: ServiceType.name,
      notFound: 'Service type not found',
      historyForeignField: 'serviceTypeId',
      historyCollection: serviceTypeHistorySchemaName,
      stages: this.usageStages({
        as: 'items',
        from: itemSchemaName,
        countAs: 'itemCount',
        foreignField: 'serviceTypeId',
      }),
      hide: { items: 0 },
    });
  }

  async createServiceType(data: CreateServiceTypeDto) {
    this.can('CREATE', 'ServiceType');

    const actorId = new Types.ObjectId(this.req.user.userId);
    await this.assertNameFree(
      this.serviceTypeModel,
      'serviceTypeName',
      data.serviceTypeName,
      'A service type with this name already exists',
    );

    const reference = await this.codeService.generateServiceTypeReference();
    const serviceType = new this.serviceTypeModel({ ...data, reference });

    applyAuditLocals(serviceType, this.req, actorId);
    await serviceType.save();

    this.logger.log(`${this.logBase} created service type ${reference}`);
    return serviceType;
  }

  async updateServiceType(reference: string, data: UpdateServiceTypeDto) {
    this.can('UPDATE', 'ServiceType');

    const actorId = new Types.ObjectId(this.req.user.userId);
    const serviceType = await this.resolve(
      this.serviceTypeModel,
      reference,
      'Service type',
    );

    if (data.serviceTypeName) {
      await this.assertNameFree(
        this.serviceTypeModel,
        'serviceTypeName',
        data.serviceTypeName,
        'A service type with this name already exists',
        serviceType._id,
      );
    }

    const updated = await this.serviceTypeModel.findOneAndUpdate(
      { _id: serviceType._id },
      { ...data },
      {
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never,
    );

    this.logger.log(
      `${this.logBase} updated service type ${serviceType.reference}`,
    );
    return updated;
  }

  /* ---------------------------------------------------------------------- *
   * Categories — who the garment is for: Men, Women, Children, Household.
   * ---------------------------------------------------------------------- */

  async findAllCategories({ page, size, ...query }: FindCategoryDto) {
    this.can('READ', 'Category');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'categoryName',
      'description',
    ]);
    const result = await this.listPage(
      this.categoryModel,
      { ...base, ...status },
      { page, size, sort: query.sort },
    );

    this.logger.log(`${this.logBase} has successfully retrieve all categories`);
    return result;
  }

  async getCategoryKpis(
    query: Omit<FindCategoryDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'Category');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'categoryName',
      'description',
    ]);
    const kpis = await this.countKpis(this.categoryModel, base, status);

    this.logger.log(`${this.logBase} has retrieved category kpis`);
    return kpis;
  }

  /**
   * The usage figure counts the link rows, not the items: an item belongs to
   * a category through `item_category`, so that table is what says how much
   * of the catalogue leans on this row.
   */
  async findCategoryByReference(
    reference: string,
  ): Promise<CatalogueRowDetail> {
    this.can('READ', 'Category');

    return await this.findDetail<CatalogueRowDetail>({
      reference,
      model: this.categoryModel,
      sourceModel: Category.name,
      notFound: 'Category not found',
      historyForeignField: 'categoryId',
      historyCollection: categoryHistorySchemaName,
      stages: this.usageStages({
        as: 'links',
        countAs: 'itemCount',
        foreignField: 'categoryId',
        from: itemCategorySchemaName,
      }),
      hide: { links: 0 },
    });
  }

  async createCategory(data: CreateCategoryDto) {
    this.can('CREATE', 'Category');

    const actorId = new Types.ObjectId(this.req.user.userId);
    await this.assertNameFree(
      this.categoryModel,
      'categoryName',
      data.categoryName,
      'A category with this name already exists',
    );

    const reference = await this.codeService.generateCategoryReference();
    const category = new this.categoryModel({ ...data, reference });

    applyAuditLocals(category, this.req, actorId);
    await category.save();

    this.logger.log(`${this.logBase} created category ${reference}`);
    return category;
  }

  async updateCategory(reference: string, data: UpdateCategoryDto) {
    this.can('UPDATE', 'Category');

    const actorId = new Types.ObjectId(this.req.user.userId);
    const category = await this.resolve(
      this.categoryModel,
      reference,
      'Category',
    );

    if (data.categoryName) {
      await this.assertNameFree(
        this.categoryModel,
        'categoryName',
        data.categoryName,
        'A category with this name already exists',
        category._id,
      );
    }

    const updated = await this.categoryModel.findOneAndUpdate(
      { _id: category._id },
      { ...data },
      {
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never,
    );

    // A rename rewrites the display name of every item filed under this
    // category. Only on a rename: switching one off changes no label.
    if (data.categoryName) {
      const itemIds = await this.itemIdsLinkedTo(
        this.itemCategoryModel,
        'categoryId',
        category._id,
      );
      await this.recomputeItemDerived(itemIds);
    }

    this.logger.log(`${this.logBase} updated category ${category.reference}`);
    return updated;
  }

  /* ---------------------------------------------------------------------- *
   * Sub categories — what part of the wardrobe: Top, Dresses, Full Set.
   * ---------------------------------------------------------------------- */

  async findAllSubCategories({ page, size, ...query }: FindSubCategoryDto) {
    this.can('READ', 'SubCategory');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'subCategoryName',
      'description',
    ]);
    const result = await this.listPage(
      this.subCategoryModel,
      { ...base, ...status },
      { page, size, sort: query.sort },
    );

    this.logger.log(
      `${this.logBase} has successfully retrieve all sub categories`,
    );
    return result;
  }

  async getSubCategoryKpis(
    query: Omit<FindSubCategoryDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'SubCategory');

    const { base, status } = this.buildFilter(query, [
      'reference',
      'subCategoryName',
      'description',
    ]);
    const kpis = await this.countKpis(this.subCategoryModel, base, status);

    this.logger.log(`${this.logBase} has retrieved sub category kpis`);
    return kpis;
  }

  async findSubCategoryByReference(
    reference: string,
  ): Promise<CatalogueRowDetail> {
    this.can('READ', 'SubCategory');

    return await this.findDetail<CatalogueRowDetail>({
      reference,
      model: this.subCategoryModel,
      sourceModel: SubCategory.name,
      notFound: 'Sub category not found',
      historyForeignField: 'subCategoryId',
      historyCollection: subCategoryHistorySchemaName,
      stages: this.usageStages({
        as: 'links',
        countAs: 'itemCount',
        foreignField: 'subCategoryId',
        from: itemSubCategorySchemaName,
      }),
      hide: { links: 0 },
    });
  }

  async createSubCategory(data: CreateSubCategoryDto) {
    this.can('CREATE', 'SubCategory');

    const actorId = new Types.ObjectId(this.req.user.userId);
    await this.assertNameFree(
      this.subCategoryModel,
      'subCategoryName',
      data.subCategoryName,
      'A sub category with this name already exists',
    );

    const reference = await this.codeService.generateSubCategoryReference();
    const subCategory = new this.subCategoryModel({ ...data, reference });

    applyAuditLocals(subCategory, this.req, actorId);
    await subCategory.save();

    this.logger.log(`${this.logBase} created sub category ${reference}`);
    return subCategory;
  }

  async updateSubCategory(reference: string, data: UpdateSubCategoryDto) {
    this.can('UPDATE', 'SubCategory');

    const actorId = new Types.ObjectId(this.req.user.userId);
    const subCategory = await this.resolve(
      this.subCategoryModel,
      reference,
      'Sub category',
    );

    if (data.subCategoryName) {
      await this.assertNameFree(
        this.subCategoryModel,
        'subCategoryName',
        data.subCategoryName,
        'A sub category with this name already exists',
        subCategory._id,
      );
    }

    const updated = await this.subCategoryModel.findOneAndUpdate(
      { _id: subCategory._id },
      { ...data },
      {
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never,
    );

    // Same fan-out as the categories: a rename moves every label under it.
    if (data.subCategoryName) {
      const itemIds = await this.itemIdsLinkedTo(
        this.itemSubCategoryModel,
        'subCategoryId',
        subCategory._id,
      );
      await this.recomputeItemDerived(itemIds);
    }

    this.logger.log(
      `${this.logBase} updated sub category ${subCategory.reference}`,
    );
    return updated;
  }

  /* ---------------------------------------------------------------------- *
   * Currencies — what the prices are in.
   * ---------------------------------------------------------------------- */

  /**
   * A currency is looked for by its code as often as by its name, so the
   * search covers both, plus the country and the symbol.
   */
  private static readonly CURRENCY_SEARCH = [
    'reference',
    'isoCode',
    'name',
    'countryName',
    'symbol',
  ];

  async findAllCurrencies({ page, size, ...query }: FindCurrencyDto) {
    this.can('READ', 'Currency');

    const { base, status } = this.buildFilter(
      query,
      CatalogueService.CURRENCY_SEARCH,
    );
    const result = await this.listPage(
      this.currencyModel,
      { ...base, ...status },
      { page, size, sort: query.sort },
    );

    this.logger.log(`${this.logBase} has successfully retrieve all currencies`);
    return result;
  }

  async getCurrencyKpis(
    query: Omit<FindCurrencyDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'Currency');

    const { base, status } = this.buildFilter(
      query,
      CatalogueService.CURRENCY_SEARCH,
    );
    const kpis = await this.countKpis(this.currencyModel, base, status);

    this.logger.log(`${this.logBase} has retrieved currency kpis`);
    return kpis;
  }

  /**
   * Two usage figures rather than one. A currency nothing is priced in may
   * still have taken years of payments, and switching it off is a different
   * act in each case, so the panel is told both.
   */
  async findCurrencyByReference(reference: string): Promise<CurrencyDetail> {
    this.can('READ', 'Currency');

    return await this.findDetail<CurrencyDetail>({
      reference,
      model: this.currencyModel,
      sourceModel: Currency.name,
      notFound: 'Currency not found',
      historyForeignField: 'currencyId',
      historyCollection: currencyHistorySchemaName,
      stages: [
        ...this.usageStages({
          as: 'items',
          from: itemSchemaName,
          countAs: 'itemCount',
          foreignField: 'currencyId',
        }),
        ...this.usageStages({
          as: 'payments',
          from: paymentSchemaName,
          countAs: 'paymentCount',
          foreignField: 'currencyId',
        }),
      ],
      hide: { items: 0, payments: 0 },
    });
  }

  /**
   * Adds a currency. Both `isoCode` and `countryName` are unique on the
   * schema, so each is checked here to answer with a plain conflict rather
   * than a driver error the browser cannot read.
   */
  async createCurrency(data: CreateCurrencyDto) {
    this.can('CREATE', 'Currency');

    const actorId = new Types.ObjectId(this.req.user.userId);

    await this.assertNameFree(
      this.currencyModel,
      'isoCode',
      data.isoCode,
      'A currency with this ISO code already exists',
    );
    await this.assertNameFree(
      this.currencyModel,
      'countryName',
      data.countryName,
      'A currency for this country already exists',
    );

    const reference = await this.codeService.generateCurrencyReference();
    const currency = new this.currencyModel({ ...data, reference });

    applyAuditLocals(currency, this.req, actorId);
    await currency.save();

    this.logger.log(`${this.logBase} created currency ${reference}`);
    return currency;
  }

  /**
   * Rewords a currency or switches it off.
   *
   * `isoCode` is not editable and the DTO does not carry it —
   * `payment.service` reads the house currency with
   * `findOne({ isoCode: 'XAF' })`, so a rename would leave that finding
   * nothing and the failure would surface as a payment with no currency,
   * nowhere near this screen.
   */
  async updateCurrency(reference: string, data: UpdateCurrencyDto) {
    this.can('UPDATE', 'Currency');

    const actorId = new Types.ObjectId(this.req.user.userId);
    const currency = await this.resolve(
      this.currencyModel,
      reference,
      'Currency',
    );

    if (data.countryName) {
      await this.assertNameFree(
        this.currencyModel,
        'countryName',
        data.countryName,
        'A currency for this country already exists',
        currency._id,
      );
    }

    const updated = await this.currencyModel.findOneAndUpdate(
      { _id: currency._id },
      { ...data },
      {
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never,
    );

    this.logger.log(`${this.logBase} updated currency ${currency.reference}`);
    return updated;
  }

  /* ---------------------------------------------------------------------- *
   * Items — the priced lines themselves, and the only catalogue collection
   * with foreign keys of its own.
   * ---------------------------------------------------------------------- */

  /**
   * The `$lookup` stages that turn an item's ids into the documents behind
   * them. Shared by the list and the detail read so the two never disagree
   * about the shape of a row.
   *
   * `preserveNullAndEmptyArrays` throughout: a row pointing at a deleted
   * service should still be readable — that is exactly the row somebody needs
   * to see and fix.
   */
  private itemLinkStages(): PipelineStage[] {
    return [
      {
        $lookup: {
          as: 'service',
          localField: 'serviceId',
          foreignField: '_id',
          from: serviceSchemaName,
        },
      },
      { $unwind: { path: '$service', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'serviceType',
          foreignField: '_id',
          localField: 'serviceTypeId',
          from: serviceTypeSchemaName,
        },
      },
      { $unwind: { path: '$serviceType', preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          as: 'currency',
          foreignField: '_id',
          localField: 'currencyId',
          from: currencySchemaName,
        },
      },
      { $unwind: { path: '$currency', preserveNullAndEmptyArrays: true } },

      // Item → categories, through the link table.
      {
        $lookup: {
          localField: '_id',
          as: 'itemCategories',
          foreignField: 'itemId',
          from: itemCategorySchemaName,
        },
      },
      {
        $lookup: {
          as: 'categories',
          foreignField: '_id',
          from: categorySchemaName,
          localField: 'itemCategories.categoryId',
        },
      },

      // Item → sub categories, the same way.
      {
        $lookup: {
          localField: '_id',
          foreignField: 'itemId',
          as: 'itemSubCategories',
          from: itemSubCategorySchemaName,
        },
      },
      {
        $lookup: {
          foreignField: '_id',
          as: 'subCategories',
          from: subCategorySchemaName,
          localField: 'itemSubCategories.subCategoryId',
        },
      },

      { $project: { itemCategories: 0, itemSubCategories: 0 } },
    ];
  }

  /**
   * The item filter. Unlike the other five it can narrow by a link, and the
   * link is named by reference — so the two picker filters are resolved to
   * ids here before the match is built.
   *
   * An unknown reference deliberately matches nothing rather than raising:
   * a stale link with a since-deleted service in it should show an empty
   * table, not a 404 on a list.
   */
  private async buildItemFilter(
    query: Omit<FindItemDto, 'page' | 'size'>,
  ): Promise<{
    base: Record<string, unknown>;
    status?: Record<string, unknown>;
  }> {
    // `displayName` as well as `itemName`, which is the point of storing it:
    // "Men" finds every item filed under that category without the caller
    // having to know the category's reference.
    const { base, status } = this.buildFilter(query, [
      'reference',
      'itemName',
      'displayName',
    ]);

    if (query.serviceReference) {
      const service = await this.serviceModel
        .findOne({ reference: query.serviceReference })
        .select('_id')
        .lean();
      base.serviceId = service?._id ?? new Types.ObjectId();
    }

    if (query.serviceTypeReference) {
      const serviceType = await this.serviceTypeModel
        .findOne({ reference: query.serviceTypeReference })
        .select('_id')
        .lean();
      base.serviceTypeId = serviceType?._id ?? new Types.ObjectId();
    }

    return { base, status };
  }

  /**
   * A page of items with every link resolved.
   *
   * An aggregation rather than `find`, because the table shows the service,
   * the service type and the currency by name — six extra round trips per
   * page if the browser had to fetch them itself. Filtering and paging happen
   * before the lookups, so only the rows on screen are joined.
   */
  async findAllItems({ page, size, ...query }: FindItemDto) {
    this.can('READ', 'Item');

    const { base, status } = await this.buildItemFilter(query);
    const where = { ...base, ...status };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);

    const total = await this.itemModel.countDocuments(where);
    const data = await this.itemModel.aggregate([
      { $match: where },
      { $sort: sort },
      { $skip: skip },
      { $limit: size },
      ...this.itemLinkStages(),
    ]);

    const totalPages = Math.ceil(total / size);

    this.logger.log(`${this.logBase} has successfully retrieve all items`);
    return { total, data, nextPage: page < totalPages ? page + 1 : null };
  }

  async getItemKpis(
    query: Omit<FindItemDto, 'page' | 'size'>,
  ): Promise<ReferenceKpis> {
    this.can('READ', 'Item');

    const { base, status } = await this.buildItemFilter(query);
    const kpis = await this.countKpis(this.itemModel, base, status);

    this.logger.log(`${this.logBase} has retrieved item kpis`);
    return kpis;
  }

  /**
   * One item: the row, everything it points at, how much work has been filed
   * against it, and its audit trail.
   */
  async findItemByReference(reference: string): Promise<ItemDetail> {
    this.can('READ', 'Item');

    return await this.findDetail<ItemDetail>({
      reference,
      model: this.itemModel,
      sourceModel: Item.name,
      notFound: 'Item not found',
      historyForeignField: 'itemId',
      historyCollection: itemHistorySchemaName,
      stages: [
        ...this.itemLinkStages(),
        ...this.usageStages({
          as: 'orderItems',
          foreignField: 'itemId',
          countAs: 'orderItemCount',
          from: orderItemSchemaName,
        }),
      ],
      hide: { orderItems: 0 },
    });
  }

  /**
   * Resolves the three links an item names by reference into the ids the
   * schema stores.
   *
   * Every unknown reference is reported at once rather than one per round
   * trip: the create panel sends all three together, so an operator with two
   * stale pickers should hear about both the first time they save.
   */
  private async resolveItemLinks(data: {
    serviceReference?: string;
    serviceTypeReference?: string;
    currencyReference?: string;
  }) {
    const [service, serviceType, currency] = await Promise.all([
      data.serviceReference
        ? this.serviceModel
            .findOne({ reference: data.serviceReference })
            .select('_id')
            .lean()
        : null,
      data.serviceTypeReference
        ? this.serviceTypeModel
            .findOne({ reference: data.serviceTypeReference })
            .select('_id')
            .lean()
        : null,
      data.currencyReference
        ? this.currencyModel
            .findOne({ reference: data.currencyReference })
            .select('_id')
            .lean()
        : null,
    ]);

    const unknown: string[] = [];
    if (data.serviceReference && !service) unknown.push('serviceReference');
    if (data.serviceTypeReference && !serviceType) {
      unknown.push('serviceTypeReference');
    }
    if (data.currencyReference && !currency) unknown.push('currencyReference');

    if (unknown.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Unknown reference',
        error: {
          code: 'VALIDATION_ERROR',
          details: unknown.map((field) => ({
            field,
            message: 'No such record',
          })),
        },
      });
    }

    return {
      serviceId: service?._id,
      currencyId: currency?._id,
      serviceTypeId: serviceType?._id,
    };
  }

  /**
   * Turns a list of category (or sub category) references into ids, refusing
   * the request if any is unknown.
   *
   * An unknown link is a validation error here, not something quietly
   * dropped: an operator who ticked five boxes and got four saved would have
   * no way of knowing which one went missing.
   */
  private async resolveLinkIds<TDoc>(
    model: Model<TDoc>,
    references: string[],
    field: string,
  ): Promise<Types.ObjectId[]> {
    if (!references.length) return [];

    const rows = await model
      .find({ reference: { $in: references } } as never)
      .select('_id reference')
      .lean<{ _id: Types.ObjectId; reference: string }[]>();

    const found = new Set(rows.map((row) => row.reference));
    const missing = references.filter((reference) => !found.has(reference));

    if (missing.length) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Unknown reference',
        error: {
          code: 'VALIDATION_ERROR',
          details: missing.map((reference) => ({
            field,
            message: `No such record: ${reference}`,
          })),
        },
      });
    }

    return rows.map((row) => row._id);
  }

  /**
   * Replaces an item's links with exactly the list given, and says whether
   * anything actually moved.
   *
   * Replace, not merge: a checkbox group in the browser can only honestly
   * say "these are the categories now". Nothing is written when the set is
   * unchanged, so a save that touched only the price leaves no link churn
   * behind it.
   */
  private async replaceLinks<TDoc>(input: {
    model: Model<TDoc>;
    itemId: Types.ObjectId;
    field: string;
    next: Types.ObjectId[];
  }): Promise<boolean> {
    const current = await input.model
      .find({ itemId: input.itemId } as never)
      .select(input.field)
      .lean<Record<string, Types.ObjectId>[]>();

    const had = new Set(current.map((row) => String(row[input.field])));
    const want = new Set(input.next.map(String));
    const same = had.size === want.size && [...want].every((id) => had.has(id));
    if (same) return false;

    await input.model.deleteMany({ itemId: input.itemId } as never);
    if (input.next.length) {
      await input.model.insertMany(
        input.next.map(
          (id) => ({ itemId: input.itemId, [input.field]: id }) as never,
        ),
      );
    }

    return true;
  }

  /**
   * Records a link change on the item's own trail.
   *
   * The link tables carry no history of their own, and they are not fields on
   * the item, so nothing else would notice. Without this an item could lose
   * every category with the trail saying only that somebody opened it.
   */
  private async recordLinkChange(input: {
    itemId: Types.ObjectId;
    actorId: Types.ObjectId;
    reason?: string;
    changedFields: Record<string, { from: unknown; to: unknown }>;
  }) {
    try {
      await this.itemHistoryModel.create({
        itemId: input.itemId,
        changedBy: input.actorId,
        reason: input.reason,
        action: HistoryActionEnum.UPDATE,
        changedFields: input.changedFields,
      });
    } catch (error) {
      // The trail observes the write, it does not take part in whether the
      // write succeeded. A failure here is logged, never raised.
      this.logger.error(
        `Failed to record the item link change: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Rewrites an item's two derived fields from what it currently points at.
   *
   * The single place either field is ever written. Both are stored, so both
   * can go stale, and there are only three ways that happens: the item's own
   * name or prices change, its category links change, or a category or sub
   * category is renamed underneath it. Every one of those calls this.
   *
   * Written without an audit context on purpose. A derived field is not a
   * change anyone made — it is the record catching up with a change already
   * on the trail — so the item's history would otherwise carry a second,
   * authorless entry saying `displayName` moved, right beside the entry that
   * says why. `timestamps: false` for the same reason: an item is not
   * "updated" because the category above it was reworded.
   *
   * Returns nothing and throws nothing. A derived label failing must never
   * fail the write that triggered it.
   */
  private async recomputeItemDerived(itemIds: Types.ObjectId[]) {
    if (!itemIds.length) return;

    try {
      const rows = await this.itemModel.aggregate<{
        _id: Types.ObjectId;
        itemName: string;
        priceLow: number;
        priceHigh: number;
        categoryNames: string[];
        subCategoryNames: string[];
      }>([
        { $match: { _id: { $in: itemIds } } },
        {
          $lookup: {
            localField: '_id',
            as: 'itemCategories',
            foreignField: 'itemId',
            from: itemCategorySchemaName,
          },
        },
        {
          $lookup: {
            as: 'categories',
            foreignField: '_id',
            from: categorySchemaName,
            localField: 'itemCategories.categoryId',
          },
        },
        {
          $lookup: {
            localField: '_id',
            foreignField: 'itemId',
            as: 'itemSubCategories',
            from: itemSubCategorySchemaName,
          },
        },
        {
          $lookup: {
            foreignField: '_id',
            as: 'subCategories',
            from: subCategorySchemaName,
            localField: 'itemSubCategories.subCategoryId',
          },
        },
        {
          $project: {
            itemName: 1,
            priceLow: 1,
            priceHigh: 1,
            categoryNames: '$categories.categoryName',
            subCategoryNames: '$subCategories.subCategoryName',
          },
        },
      ]);

      if (!rows.length) return;

      await this.itemModel.bulkWrite(
        rows.map((row) => ({
          updateOne: {
            filter: { _id: row._id },
            update: {
              $set: {
                unitPrice: itemUnitPrice(row.priceLow, row.priceHigh),
                displayName: itemDisplayName({
                  itemName: row.itemName,
                  categoryNames: row.categoryNames,
                  subCategoryNames: row.subCategoryNames,
                }),
              },
            },
            timestamps: false,
          },
        })),
        // No audit context: see the note above.
        { timestamps: false },
      );
    } catch (error) {
      this.logger.error(
        `Failed to recompute the derived fields of ${itemIds.length} item(s): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * The items filed under one category or sub category, for the fan-out after
   * a rename. Ids only — the recompute reads everything else itself.
   */
  private async itemIdsLinkedTo<TLink>(
    linkModel: Model<TLink>,
    field: string,
    targetId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const links = await linkModel
      .find({ [field]: targetId } as never)
      .select('itemId')
      .lean<{ itemId: Types.ObjectId }[]>();

    return links.map((link) => link.itemId);
  }

  /**
   * Adds an item.
   *
   * The three links are named by reference and resolved here, the price pair
   * is checked as a pair — no per-field rule can say `priceHigh` is not below
   * `priceLow` — and the category links are written after the row exists,
   * because they point at its id.
   */
  async createItem(data: CreateItemDto) {
    this.can('CREATE', 'Item');

    const actorId = new Types.ObjectId(this.req.user.userId);

    if (data.priceHigh < data.priceLow) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'priceHigh must not be below priceLow',
      });
    }

    await this.assertNameFree(
      this.itemModel,
      'itemName',
      data.itemName,
      'An item with this name already exists',
    );

    const links = await this.resolveItemLinks(data);
    const [categoryIds, subCategoryIds] = await Promise.all([
      this.resolveLinkIds(
        this.categoryModel,
        data.categoryReferences ?? [],
        'categoryReferences',
      ),
      this.resolveLinkIds(
        this.subCategoryModel,
        data.subCategoryReferences ?? [],
        'subCategoryReferences',
      ),
    ]);

    const reference = await this.codeService.generateItemReference();
    const item = new this.itemModel({
      reference,
      itemName: data.itemName,
      priceLow: data.priceLow,
      priceHigh: data.priceHigh,
      serviceId: links.serviceId,
      currencyId: links.currencyId,
      serviceTypeId: links.serviceTypeId,
    });

    applyAuditLocals(item, this.req, actorId);
    await item.save();

    if (categoryIds.length) {
      await this.itemCategoryModel.insertMany(
        categoryIds.map((categoryId) => ({ itemId: item._id, categoryId })),
      );
    }
    if (subCategoryIds.length) {
      await this.itemSubCategoryModel.insertMany(
        subCategoryIds.map((subCategoryId) => ({
          subCategoryId,
          itemId: item._id,
        })),
      );
    }

    // Last, not first: the display name reads the links, and the links only
    // exist once the item they point at does.
    await this.recomputeItemDerived([item._id]);

    this.logger.log(`${this.logBase} created item ${reference}`);
    return await this.itemModel.findById(item._id);
  }

  /**
   * Edits an item.
   *
   * The price pair is checked against the row as it will be, not as it was
   * sent: raising `priceLow` alone past a `priceHigh` that is not in the body
   * is the same mistake as sending both the wrong way round.
   */
  async updateItem(reference: string, data: UpdateItemDto) {
    this.can('UPDATE', 'Item');

    const actorId = new Types.ObjectId(this.req.user.userId);
    const item = await this.resolve(this.itemModel, reference, 'Item');

    const priceLow = data.priceLow ?? item.priceLow;
    const priceHigh = data.priceHigh ?? item.priceHigh;
    if (priceHigh < priceLow) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'priceHigh must not be below priceLow',
      });
    }

    if (data.itemName) {
      await this.assertNameFree(
        this.itemModel,
        'itemName',
        data.itemName,
        'An item with this name already exists',
        item._id,
      );
    }

    const links = await this.resolveItemLinks(data);

    const patch: Record<string, unknown> = {};
    if (data.itemName !== undefined) patch.itemName = data.itemName;
    if (data.priceLow !== undefined) patch.priceLow = data.priceLow;
    if (data.priceHigh !== undefined) patch.priceHigh = data.priceHigh;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    if (links.serviceId) patch.serviceId = links.serviceId;
    if (links.currencyId) patch.currencyId = links.currencyId;
    if (links.serviceTypeId) patch.serviceTypeId = links.serviceTypeId;

    // The result is deliberately not kept: the derived fields are rewritten
    // below, so the row is re-read at the end and this copy would be stale.
    if (Object.keys(patch).length) {
      await this.itemModel.findOneAndUpdate({ _id: item._id }, patch, {
        returnDocument: 'after',
        context: auditContext(this.req, actorId),
      } as never);
    }

    // The link lists are absent unless the operator sent them, and an absent
    // list leaves the links alone. An empty one clears them — that is a
    // decision, not an omission.
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};

    if (data.categoryReferences) {
      const next = await this.resolveLinkIds(
        this.categoryModel,
        data.categoryReferences,
        'categoryReferences',
      );
      const before = await this.currentLinkReferences(
        this.itemCategoryModel,
        this.categoryModel,
        item._id,
        'categoryId',
      );
      const moved = await this.replaceLinks({
        next,
        itemId: item._id,
        field: 'categoryId',
        model: this.itemCategoryModel,
      });
      if (moved) {
        changedFields.categories = {
          from: before,
          to: data.categoryReferences,
        };
      }
    }

    if (data.subCategoryReferences) {
      const next = await this.resolveLinkIds(
        this.subCategoryModel,
        data.subCategoryReferences,
        'subCategoryReferences',
      );
      const before = await this.currentLinkReferences(
        this.itemSubCategoryModel,
        this.subCategoryModel,
        item._id,
        'subCategoryId',
      );
      const moved = await this.replaceLinks({
        next,
        itemId: item._id,
        field: 'subCategoryId',
        model: this.itemSubCategoryModel,
      });
      if (moved) {
        changedFields.subCategories = {
          from: before,
          to: data.subCategoryReferences,
        };
      }
    }

    if (Object.keys(changedFields).length) {
      await this.recordLinkChange({
        actorId,
        changedFields,
        itemId: item._id,
        reason: this.req.headers?.['x-change-reason'] as string | undefined,
      });
    }

    // After the fields AND the links, since either can move the label.
    await this.recomputeItemDerived([item._id]);

    this.logger.log(`${this.logBase} updated item ${item.reference}`);
    // Re-read: `updated` was captured before the recompute, so returning it
    // would hand back the row with its old display name and unit price.
    return await this.itemModel.findById(item._id);
  }

  /**
   * The references an item is linked to today, for the audit trail. Read
   * before the replace, and as references rather than ids so the trail says
   * `['CT-A4F92C']` and not a pair of mongo ids nobody can place.
   */
  private async currentLinkReferences<TLink, TTarget>(
    linkModel: Model<TLink>,
    targetModel: Model<TTarget>,
    itemId: Types.ObjectId,
    field: string,
  ): Promise<string[]> {
    const links = await linkModel
      .find({ itemId } as never)
      .select(field)
      .lean<Record<string, Types.ObjectId>[]>();
    if (!links.length) return [];

    const rows = await targetModel
      .find({ _id: { $in: links.map((link) => link[field]) } } as never)
      .select('reference')
      .lean<{ reference: string }[]>();

    return rows.map((row) => row.reference).filter(Boolean);
  }
}
