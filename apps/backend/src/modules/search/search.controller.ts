import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse } from '@nestjs/swagger';
import { SearchProductsResponse } from '../product/dto/product-response.dto';
import { SearchProductsDto } from './dto/search-products.dto';
import { SearchService } from './search.service';

/** /search — 공개 상품 검색 (인증 불필요) */
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  /** GET /search/products — 키워드·카테고리·가격·정렬 필터 + offset 페이지네이션 */
  @Get('products')
  @ApiOkResponse({ type: SearchProductsResponse })
  searchProducts(@Query() query: SearchProductsDto) {
    return this.searchService.searchProducts(query);
  }
}
