using System;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Phineas.Data.Migrations
{
    /// <inheritdoc />
    public partial class AjoutVeillesRecommandation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VeillesRecommandation",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("MySql:ValueGenerationStrategy", MySqlValueGenerationStrategy.IdentityColumn),
                    DealershipId = table.Column<int>(type: "int", nullable: false),
                    ConseillerId = table.Column<string>(type: "varchar(450)", maxLength: 450, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    OpportuniteId = table.Column<int>(type: "int", nullable: false),
                    Regle = table.Column<string>(type: "varchar(60)", maxLength: 60, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CleRecommandation = table.Column<string>(type: "varchar(160)", maxLength: 160, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    CleActive = table.Column<string>(type: "varchar(160)", maxLength: 160, nullable: true)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    EtapeAuDebut = table.Column<string>(type: "varchar(30)", maxLength: 30, nullable: false)
                        .Annotation("MySql:CharSet", "utf8mb4"),
                    DebutUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    FinUtc = table.Column<DateTime>(type: "datetime(6)", nullable: false),
                    ModifieeLeUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true),
                    ReactiveeLeUtc = table.Column<DateTime>(type: "datetime(6)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VeillesRecommandation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_VeillesRecommandation_AspNetUsers_ConseillerId",
                        column: x => x.ConseillerId,
                        principalTable: "AspNetUsers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VeillesRecommandation_Dealerships_DealershipId",
                        column: x => x.DealershipId,
                        principalTable: "Dealerships",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_VeillesRecommandation_OpportunitesVente_OpportuniteId",
                        column: x => x.OpportuniteId,
                        principalTable: "OpportunitesVente",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                })
                .Annotation("MySql:CharSet", "utf8mb4");

            migrationBuilder.CreateIndex(
                name: "IX_VeillesRecommandation_ConseillerId_CleActive",
                table: "VeillesRecommandation",
                columns: new[] { "ConseillerId", "CleActive" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_VeillesRecommandation_DealershipId",
                table: "VeillesRecommandation",
                column: "DealershipId");

            migrationBuilder.CreateIndex(
                name: "IX_VeillesRecommandation_OpportuniteId",
                table: "VeillesRecommandation",
                column: "OpportuniteId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VeillesRecommandation");
        }
    }
}
