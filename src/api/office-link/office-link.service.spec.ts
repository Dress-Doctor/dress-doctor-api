import { ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Office } from 'src/schema/office/office.schema';
import { OfficeLinkService } from './office-link.service';

describe('OfficeLinkService', () => {
  let service: OfficeLinkService;
  let codeService: { verifyOfficeLink: jest.Mock };
  let officeModel: { findOne: jest.Mock };

  const future = (Date.now() + 60_000).toString();
  const past = (Date.now() - 60_000).toString();

  beforeEach(async () => {
    codeService = { verifyOfficeLink: jest.fn().mockReturnValue(true) };
    officeModel = { findOne: jest.fn().mockResolvedValue({ _id: 'office-1' }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficeLinkService,
        { provide: CodeGeneratorService, useValue: codeService },
        { provide: getModelToken(Office.name), useValue: officeModel },
      ],
    }).compile();

    service = module.get<OfficeLinkService>(OfficeLinkService);
  });

  it('resolves the office for a valid, unexpired, correctly-signed link', async () => {
    const office = await service.validateOfficeLink('slug', 'sig', future);
    expect(office).toEqual({ _id: 'office-1' });
    expect(codeService.verifyOfficeLink).toHaveBeenCalledWith(
      'slug',
      Number(future),
      'sig',
    );
  });

  it('rejects an expired link', async () => {
    await expect(
      service.validateOfficeLink('slug', 'sig', past),
    ).rejects.toThrow(ForbiddenException);
    expect(codeService.verifyOfficeLink).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric expiry', async () => {
    await expect(
      service.validateOfficeLink('slug', 'sig', 'not-a-number'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects a tampered signature', async () => {
    codeService.verifyOfficeLink.mockReturnValue(false);
    await expect(
      service.validateOfficeLink('slug', 'sig', future),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('CodeGeneratorService.verifyOfficeLink (constant-time)', () => {
  const originalSecret = process.env.DD_OFFICE_LINK_SECRET;
  beforeAll(() => {
    process.env.DD_OFFICE_LINK_SECRET = 'test-secret';
  });
  afterAll(() => {
    process.env.DD_OFFICE_LINK_SECRET = originalSecret;
  });

  // Only signOfficeLink/verifyOfficeLink are exercised — no models needed.
  const svc = Object.create(
    CodeGeneratorService.prototype,
  ) as CodeGeneratorService;

  it('verifies a signature it produced and rejects a tampered one', () => {
    const exp = Date.now() + 1000;
    const sig = svc.signOfficeLink('bonapriso', exp);

    expect(svc.verifyOfficeLink('bonapriso', exp, sig)).toBe(true);
    expect(svc.verifyOfficeLink('bonapriso', exp, sig + 'x')).toBe(false);
    expect(svc.verifyOfficeLink('other', exp, sig)).toBe(false);
    expect(svc.verifyOfficeLink('bonapriso', exp + 1, sig)).toBe(false);
  });
});
